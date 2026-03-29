/**
 * GPUGridRenderer: fullscreen-quad WebGPU renderer that reads directly from
 * simulation storage buffers. Zero CPU readback for rendering.
 *
 * Renders cells as a 2D grid with camera transform (pan + zoom).
 * Reads colorR/G/B/alpha written by visual mapping compute passes.
 * Fallback: first cell property → grayscale when no color mapper is present.
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
  /** Offset of first cell property — grayscale fallback when no color mapper wrote colorR/G/B */
  fallbackOffset: number;
  /** Offsets of colorR, colorG, colorB, alpha in the buffer */
  colorROffset: number;
  colorGOffset: number;
  colorBOffset: number;
  alphaOffset: number;
}

// Render params: 32 floats/u32s = 128 bytes (aligned to 16)
const RENDER_PARAMS_SIZE = 128;

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
  gridWidth: u32,         // 0
  gridHeight: u32,        // 1
  stride: u32,            // 2
  fallbackOffset: u32,    // 3: first cell property, used for grayscale when no color mapper
  canvasWidth: f32,       // 4
  canvasHeight: f32,      // 5
  viewOffsetX: f32,       // 6
  viewOffsetY: f32,       // 7
  viewScale: f32,         // 8
  colorROffset: u32,      // 9
  colorGOffset: u32,      // 10
  colorBOffset: u32,      // 11
  alphaOffset: u32,       // 12
  bgR: f32,               // 13
  bgG: f32,               // 14
  bgB: f32,               // 15
  _pad0: u32,             // 16
  _pad1: u32,             // 17
  _pad2: u32,             // 18
  _pad3: u32,             // 19
  _pad4: u32,             // 20
  _pad5: u32,             // 21
  _pad6: u32,             // 22
  _pad7: u32,             // 23
  _pad8: u32,             // 24
  _pad9: u32,             // 25
  _pad10: u32,            // 26
  _pad11: u32,            // 27
  _pad12: u32,            // 28
  _pad13: u32,            // 29
  _pad14: u32,            // 30
  _pad15: u32,            // 31
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

  // Read color written by visual mapping compute pass
  let cr = cells[idx * rp.stride + rp.colorROffset];
  let cg = cells[idx * rp.stride + rp.colorGOffset];
  let cb = cells[idx * rp.stride + rp.colorBOffset];
  let a = cells[idx * rp.stride + rp.alphaOffset];

  var r: f32; var g: f32; var b: f32;

  // Fallback: if no color mapper wrote to colorR/G/B, show first property as grayscale
  let hasColor = (cr + cg + cb) > 0.001;
  if (hasColor) {
    r = cr; g = cg; b = cb;
  } else {
    let v = clamp(cells[idx * rp.stride + rp.fallbackOffset], 0.0, 1.0);
    r = v; g = v; b = v;
  }

  // Apply alpha (premultiplied blend toward background)
  r = mix(rp.bgR, r, a);
  g = mix(rp.bgG, g, a);
  b = mix(rp.bgB, b, a);

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
  private clearColor: { r: number; g: number; b: number; a: number } = { r: 0.086, g: 0.086, b: 0.086, a: 1 };

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

  /** Set the background clear color (hex string like "#ff0000") */
  setClearColor(hex: string): void {
    if (!hex || hex.length < 7) return;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    this.clearColor = { r, g, b, a: 1 };
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
    u32View[3] = this.colorMapping.fallbackOffset;
    f32View[4] = camera.canvasWidth;
    f32View[5] = camera.canvasHeight;
    f32View[6] = camera.offsetX;
    f32View[7] = camera.offsetY;
    f32View[8] = camera.scale;
    u32View[9] = this.colorMapping.colorROffset;
    u32View[10] = this.colorMapping.colorGOffset;
    u32View[11] = this.colorMapping.colorBOffset;
    u32View[12] = this.colorMapping.alphaOffset;
    f32View[13] = this.clearColor.r;
    f32View[14] = this.clearColor.g;
    f32View[15] = this.clearColor.b;

    this.device.queue.writeBuffer(this.renderParamsBuffer, 0, data);

    // Render pass
    const textureView = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder({ label: 'grid-render' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: this.clearColor,
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
