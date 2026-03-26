/**
 * BrushDispatcher: GPU compute shader for property-aware brush application.
 *
 * Dispatched before rule stages in the tick pipeline. Writes property values
 * in-place to the grid read buffer using a separate read-write bind group layout.
 *
 * The brush shader is data-driven — a fixed WGSL program reads brush parameters
 * and property actions from uniform/storage buffers. No recompilation needed
 * when the brush changes; only the buffer data is updated.
 */

import { GPUContext } from './GPUContext';
import { ShaderCompiler } from './ShaderCompiler';
import type { PropertyLayout } from './types';
import type { Brush, BrushPropertyAction } from '../../store/brushStore';
import { logGPU } from '../../lib/debugLog';

/** Max property actions per brush (matches WGSL fixed array size) */
const MAX_BRUSH_ACTIONS = 16;

/** Size of BrushParams uniform in bytes (aligned to 16) */
const BRUSH_PARAMS_SIZE = 48; // 9 u32/f32 + 3 padding = 12 × 4 = 48

/** Size of BrushActions storage buffer in bytes */
const BRUSH_ACTIONS_SIZE = 4 + 12 + MAX_BRUSH_ACTIONS * 16; // count(4) + pad(12) + actions(16×16)
// Actually: struct alignment means count + pad12 + 16*16 = 272
// Let's compute: count(u32, 4) + _pad(12) = 16, then 16 actions × 16 each = 256, total = 272

const BRUSH_ACTIONS_BUFFER_SIZE = 16 + MAX_BRUSH_ACTIONS * 16; // 272 bytes

/** The fixed WGSL compute shader for brush application */
const BRUSH_WGSL = /* wgsl */ `
struct BrushParams {
  cursor_x: f32,
  cursor_y: f32,
  radius: f32,
  falloff_mode: u32,
  shape: u32,
  grid_width: u32,
  grid_height: u32,
  stride: u32,
  action_count: u32,
  seed: u32,
  _pad0: u32,
  _pad1: u32,
}

struct BrushAction {
  property_offset: u32,
  value: f32,
  mode: u32,
  _pad: u32,
}

@group(0) @binding(0) var<storage, read_write> grid: array<f32>;
@group(0) @binding(1) var<uniform> params: BrushParams;
@group(0) @binding(2) var<storage, read> actions: array<BrushAction>;

// PCG-style hash for per-cell random (deterministic per seed + position + action)
fn pcg_hash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(x: u32, y: u32, action_idx: u32, seed: u32) -> f32 {
  let h = pcg_hash(x + y * 65537u + action_idx * 16777259u + seed);
  return f32(h) / 4294967295.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.grid_width || y >= params.grid_height) { return; }

  let dx = f32(x) - params.cursor_x;
  let dy = f32(y) - params.cursor_y;

  var dist: f32;
  if (params.shape == 0u) {
    // Circle
    dist = sqrt(dx * dx + dy * dy);
  } else {
    // Square
    dist = max(abs(dx), abs(dy));
  }

  if (dist > params.radius) { return; }

  // Compute falloff strength
  var strength: f32 = 1.0;
  let norm = dist / max(params.radius, 0.001);
  if (params.falloff_mode == 1u) {
    // Linear
    strength = 1.0 - norm;
  } else if (params.falloff_mode == 2u) {
    // Smoothstep
    strength = 1.0 - smoothstep(0.0, 1.0, norm);
  }
  // mode 0 (hard) = strength stays 1.0

  let cell_idx = y * params.grid_width + x;

  for (var i = 0u; i < params.action_count; i++) {
    let act = actions[i];
    let buf_idx = cell_idx * params.stride + act.property_offset;
    let current = grid[buf_idx];
    var new_val: f32;

    if (act.mode == 0u) {
      // Set: lerp from current to target based on strength
      new_val = mix(current, act.value, strength);
    } else if (act.mode == 1u) {
      // Add: add value scaled by strength
      new_val = current + act.value * strength;
    } else if (act.mode == 2u) {
      // Multiply: lerp the multiplier based on strength
      new_val = current * mix(1.0, act.value, strength);
    } else {
      // Random: random value in [0, act.value], scaled by strength
      let r = rand01(x, y, i, params.seed) * act.value;
      new_val = mix(current, r, strength);
    }

    grid[buf_idx] = new_val;
  }
}
`;

const FALLOFF_MAP: Record<string, number> = { hard: 0, linear: 1, smooth: 2 };
const SHAPE_MAP: Record<string, number> = { circle: 0, square: 1 };
const MODE_MAP: Record<string, number> = { set: 0, add: 1, multiply: 2, random: 3 };

/** Monotonic counter for RNG seed — different random pattern each frame */
let seedCounter = 0;

export class BrushDispatcher {
  private pipeline: GPUComputePipeline | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private actionsBuffer: GPUBuffer | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private compiler: ShaderCompiler;

  /** Cached grid dimensions for workgroup calculation */
  private gridWidth = 0;
  private gridHeight = 0;

  constructor(compiler?: ShaderCompiler) {
    this.compiler = compiler ?? new ShaderCompiler();
  }

  /**
   * Compile the brush pipeline and create GPU resources.
   * Must be called after BufferManager is initialized.
   */
  initialize(
    gridWidth: number,
    gridHeight: number,
    gridBuffer: GPUBuffer,
  ): void {
    this.destroy();

    const ctx = GPUContext.get();
    const device = ctx.device;

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // Create bind group layout (different from rule stages — read-write storage)
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'brush-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    // Create params uniform buffer
    this.paramsBuffer = device.createBuffer({
      label: 'brush-params',
      size: BRUSH_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create actions storage buffer
    this.actionsBuffer = device.createBuffer({
      label: 'brush-actions',
      size: BRUSH_ACTIONS_BUFFER_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Create pipeline
    const module = this.compiler.compile(BRUSH_WGSL, 'brush-apply');
    const pipelineLayout = device.createPipelineLayout({
      label: 'brush-pipeline-layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });
    this.pipeline = device.createComputePipeline({
      label: 'brush-apply',
      layout: pipelineLayout,
      compute: { module, entryPoint: 'main' },
    });

    // Create bind group
    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gridBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
        { binding: 2, resource: { buffer: this.actionsBuffer } },
      ],
    });

    logGPU(`BrushDispatcher initialized (${gridWidth}×${gridHeight})`);
  }

  /**
   * Rebuild the bind group when the grid buffer reference changes (after swap).
   * Call this before dispatching if the read buffer has changed since last initialize.
   */
  rebindGridBuffer(gridBuffer: GPUBuffer): void {
    if (!this.bindGroupLayout || !this.paramsBuffer || !this.actionsBuffer) return;
    const ctx = GPUContext.get();
    this.bindGroup = ctx.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: gridBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
        { binding: 2, resource: { buffer: this.actionsBuffer } },
      ],
    });
  }

  /**
   * Dispatch the brush compute shader.
   * Call only when isDrawing is true — skip entirely when not drawing.
   *
   * @param encoder - The command encoder (shared with the rest of the tick pipeline)
   * @param cursorX - Grid-space cursor X
   * @param cursorY - Grid-space cursor Y
   * @param brush - The active brush configuration
   * @param radius - Effective radius (may be overridden)
   * @param stride - Buffer stride (floats per cell)
   * @param propertyLayout - Property layout for offset lookup
   */
  dispatch(
    encoder: GPUCommandEncoder,
    cursorX: number,
    cursorY: number,
    brush: Brush,
    radius: number,
    stride: number,
    propertyLayout: PropertyLayout[],
  ): void {
    if (!this.pipeline || !this.bindGroup || !this.paramsBuffer || !this.actionsBuffer) return;

    const ctx = GPUContext.get();

    // Build property action data
    const propEntries = Object.entries(brush.properties);
    const actionCount = Math.min(propEntries.length, MAX_BRUSH_ACTIONS);

    // Write params uniform
    const paramsData = new ArrayBuffer(BRUSH_PARAMS_SIZE);
    const pf32 = new Float32Array(paramsData);
    const pu32 = new Uint32Array(paramsData);
    pf32[0] = cursorX;           // cursor_x
    pf32[1] = cursorY;           // cursor_y
    pf32[2] = radius;            // radius
    pu32[3] = FALLOFF_MAP[brush.falloff] ?? 0; // falloff_mode
    pu32[4] = SHAPE_MAP[brush.shape] ?? 0;     // shape
    pu32[5] = this.gridWidth;    // grid_width
    pu32[6] = this.gridHeight;   // grid_height
    pu32[7] = stride;            // stride
    pu32[8] = actionCount;       // action_count
    pu32[9] = seedCounter++;     // seed (unique per dispatch for RNG)
    ctx.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

    // Write actions storage buffer
    const actionsData = new ArrayBuffer(BRUSH_ACTIONS_BUFFER_SIZE);
    const au32 = new Uint32Array(actionsData);
    const af32 = new Float32Array(actionsData);
    // First 16 bytes unused (actions array starts at offset 0 in the array<BrushAction>)
    // Actually the struct layout: array<BrushAction> starts at byte 0
    // Each BrushAction is 16 bytes: property_offset(u32), value(f32), mode(u32), _pad(u32)
    for (let i = 0; i < actionCount; i++) {
      const [propName, action] = propEntries[i];
      const layoutEntry = propertyLayout.find(p => p.name === propName);
      if (!layoutEntry) continue;
      const base = i * 4; // 4 u32/f32 per action
      au32[base + 0] = layoutEntry.offset;           // property_offset
      af32[base + 1] = action.value;                 // value
      au32[base + 2] = MODE_MAP[action.mode] ?? 0;   // mode
      au32[base + 3] = 0;                            // _pad
    }
    ctx.device.queue.writeBuffer(this.actionsBuffer, 0, actionsData);

    // Dispatch
    const wgX = Math.ceil(this.gridWidth / 8);
    const wgY = Math.ceil(this.gridHeight / 8);
    const pass = encoder.beginComputePass({ label: 'brush-apply' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(wgX, wgY, 1);
    pass.end();
  }

  /** Release all GPU resources */
  destroy(): void {
    this.paramsBuffer?.destroy();
    this.actionsBuffer?.destroy();
    this.paramsBuffer = null;
    this.actionsBuffer = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.bindGroupLayout = null;
  }
}
