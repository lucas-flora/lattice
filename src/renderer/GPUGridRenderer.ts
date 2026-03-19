/**
 * GPUGridRenderer: fullscreen-quad WebGPU renderer that reads directly from
 * simulation storage buffers. Zero CPU readback for rendering.
 *
 * Renders cells as a 2D grid with camera transform (pan + zoom).
 * Supports binary alive/dead coloring and continuous gradient modes.
 */

import { GPUContext } from '@/engine/gpu/GPUContext';
import type { PropertyLayout } from '@/engine/gpu/types';

/** Camera state in grid-space units */
export interface GPUCameraState {
  offsetX: number;
  offsetY: number;
  scale: number;       // pixels per cell
  canvasWidth: number;
  canvasHeight: number;
}

/** How to map cell data to colors */
export interface ColorMappingConfig {
  mode: 'binary' | 'gradient';
  /** Property offset for the primary value (alive, u, v, etc.) */
  primaryOffset: number;
  /** For gradient mode: which property to visualize */
  gradientOffset: number;
  deadColor: [number, number, number];
  aliveColor: [number, number, number];
}

// Render params uniform: 20 floats = 80 bytes, padded to 96 (multiple of 16)
const RENDER_PARAMS_SIZE = 96;

const VERTEX_SHADER = /* wgsl */`
struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VertexOutput {
  // Fullscreen triangle: 3 vertices cover the entire screen
  var out: VertexOutput;
  let x = f32(i32(vid) / 2) * 4.0 - 1.0;
  let y = f32(i32(vid) % 2) * 4.0 - 1.0;
  out.pos = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}
`;

const FRAGMENT_SHADER = /* wgsl */`
@group(0) @binding(0) var<storage, read> cells: array<f32>;
@group(0) @binding(1) var<uniform> rp: RenderParams;

struct RenderParams {
  gridWidth: u32,
  gridHeight: u32,
  stride: u32,
  primaryOffset: u32,
  canvasWidth: f32,
  canvasHeight: f32,
  viewOffsetX: f32,
  viewOffsetY: f32,
  viewScale: f32,
  deadR: f32, deadG: f32, deadB: f32,
  aliveR: f32, aliveG: f32, aliveB: f32,
  mappingMode: u32,  // 0=binary, 1=gradient
  gradientOffset: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  bgR: f32, bgG: f32, bgB: f32,
  _pad3: f32,
}

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let pixelX = uv.x * rp.canvasWidth;
  let pixelY = (1.0 - uv.y) * rp.canvasHeight;  // flip Y: screen top = high grid Y
  let gridX = (pixelX / rp.viewScale) + rp.viewOffsetX;
  let gridY = (pixelY / rp.viewScale) + rp.viewOffsetY;

  let gx = i32(floor(gridX));
  let gy = i32(floor(gridY));

  if (gx < 0 || gx >= i32(rp.gridWidth) || gy < 0 || gy >= i32(rp.gridHeight)) {
    return vec4<f32>(rp.bgR, rp.bgG, rp.bgB, 1.0);
  }

  let idx = u32(gy) * rp.gridWidth + u32(gx);
  let primary = cells[idx * rp.stride + rp.primaryOffset];

  var r: f32; var g: f32; var b: f32;

  if (rp.mappingMode == 1u) {
    // Gradient mode: map value to color ramp
    let v = cells[idx * rp.stride + rp.gradientOffset];
    // Blue→white→red gradient
    r = smoothstep(0.2, 0.6, v);
    g = 1.0 - abs(v - 0.35) * 2.5;
    b = 1.0 - smoothstep(0.0, 0.4, v);
    g = max(g, 0.0);
  } else {
    // Binary mode: lerp between dead/alive colors
    r = mix(rp.deadR, rp.aliveR, primary);
    g = mix(rp.deadG, rp.aliveG, primary);
    b = mix(rp.deadB, rp.aliveB, primary);
  }

  return vec4<f32>(r, g, b, 1.0);
}
`;

export class GPUGridRenderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private renderPipeline: GPURenderPipeline | null = null;
  private renderParamsBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private canvasFormat: GPUTextureFormat;
  private canvas: HTMLCanvasElement;
  private colorMapping: ColorMappingConfig | null = null;
  private currentReadBuffer: GPUBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.device = GPUContext.get().device;

    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('Failed to get WebGPU canvas context');
    this.context = ctx;

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
    });

    this.createRenderPipeline();
    this.renderParamsBuffer = this.device.createBuffer({
      size: RENDER_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'render-params',
    });
  }

  private createRenderPipeline(): void {
    const shaderModule = this.device.createShaderModule({
      code: VERTEX_SHADER + '\n' + FRAGMENT_SHADER,
      label: 'grid-render-shader',
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-list' },
      label: 'grid-render-pipeline',
    });
  }

  /**
   * Configure for a specific simulation. Must be called after GPURuleRunner.initialize().
   */
  setSimulation(
    readBuffer: GPUBuffer,
    paramsNotUsed: GPUBuffer,
    propertyLayout: PropertyLayout[],
    colorMapping: ColorMappingConfig,
  ): void {
    this.currentReadBuffer = readBuffer;
    this.colorMapping = colorMapping;
    this.rebuildBindGroup(readBuffer);
  }

  private rebuildBindGroup(readBuffer: GPUBuffer): void {
    if (!this.renderPipeline || !this.renderParamsBuffer) return;

    this.bindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: readBuffer } },
        { binding: 1, resource: { buffer: this.renderParamsBuffer } },
      ],
      label: 'grid-render-bindgroup',
    });
  }

  /** Update which buffer to read from (called after sim tick swaps buffers) */
  updateReadBuffer(readBuffer: GPUBuffer): void {
    if (readBuffer !== this.currentReadBuffer) {
      this.currentReadBuffer = readBuffer;
      this.rebuildBindGroup(readBuffer);
    }
  }

  /** Render one frame */
  render(
    camera: GPUCameraState,
    gridWidth: number,
    gridHeight: number,
    stride: number,
  ): void {
    if (!this.renderPipeline || !this.bindGroup || !this.renderParamsBuffer || !this.colorMapping) return;

    // Update render params uniform
    const data = new ArrayBuffer(RENDER_PARAMS_SIZE);
    const u32View = new Uint32Array(data);
    const f32View = new Float32Array(data);

    u32View[0] = gridWidth;
    u32View[1] = gridHeight;
    u32View[2] = stride;
    u32View[3] = this.colorMapping.primaryOffset;
    f32View[4] = camera.canvasWidth;
    f32View[5] = camera.canvasHeight;
    f32View[6] = camera.offsetX;
    f32View[7] = camera.offsetY;
    f32View[8] = camera.scale;
    f32View[9] = this.colorMapping.deadColor[0];
    f32View[10] = this.colorMapping.deadColor[1];
    f32View[11] = this.colorMapping.deadColor[2];
    f32View[12] = this.colorMapping.aliveColor[0];
    f32View[13] = this.colorMapping.aliveColor[1];
    f32View[14] = this.colorMapping.aliveColor[2];
    u32View[15] = this.colorMapping.mode === 'gradient' ? 1 : 0;
    u32View[16] = this.colorMapping.gradientOffset;
    // Background color (dark zinc)
    f32View[20] = 0.07;  // ~zinc-900
    f32View[21] = 0.07;
    f32View[22] = 0.08;

    this.device.queue.writeBuffer(this.renderParamsBuffer, 0, data);

    // Render pass
    const textureView = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder({ label: 'grid-render' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.07, g: 0.07, b: 0.08, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3); // fullscreen triangle
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /** Reconfigure canvas after resize */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
    });
  }

  destroy(): void {
    this.renderParamsBuffer?.destroy();
    this.renderParamsBuffer = null;
    this.renderPipeline = null;
    this.bindGroup = null;
  }
}
