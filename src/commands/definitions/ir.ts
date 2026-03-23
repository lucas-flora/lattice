/**
 * IR commands: ir.test, ir.show.
 *
 * ir.test — End-to-end validation: build Conway IR → validate → generate WGSL →
 *   compile shader → dispatch on GPU → readback → verify glider moved correctly.
 *
 * ir.show — Generate both WGSL and Python from Conway IR and display in terminal.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { validateIR } from '../../engine/ir/validate';
import { generateWGSL, type WGSLCodegenConfig } from '../../engine/ir/WGSLCodegen';
import { generatePython } from '../../engine/ir/PythonCodegen';
import { CONWAY_GOL_IR } from '../../engine/ir/__tests__/referencePrograms';
import { GPUContext } from '../../engine/gpu/GPUContext';
import { BufferManager } from '../../engine/gpu/BufferManager';
import { ShaderCompiler } from '../../engine/gpu/ShaderCompiler';
import { ComputeDispatcher } from '../../engine/gpu/ComputeDispatcher';
import type { PropertyLayout } from '../../engine/gpu/types';

const NoParams = z.object({}).describe('none');

const ShowParams = z.object({
  preset: z.enum(['conway', 'fade', 'gray-scott']).optional(),
}).describe('{ preset?: "conway" | "fade" | "gray-scott" }');

/** Standard config for Conway with a single 'alive' property */
function conwayCodegenConfig(layout: PropertyLayout[]): WGSLCodegenConfig {
  return {
    workgroupSize: [8, 8, 1],
    topology: 'toroidal',
    propertyLayout: layout,
    envParams: [],
    globalParams: [],
  };
}

export function registerIrCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'ir.test',
    description: 'End-to-end IR→WGSL→GPU validation with Conway glider',
    category: 'ir',
    params: NoParams,
    execute: async () => {
      try {
        // 1. Validate Conway IR
        const valStart = performance.now();
        const validation = validateIR(CONWAY_GOL_IR);
        const valMs = performance.now() - valStart;
        if (!validation.valid) {
          return { success: false, error: `IR validation failed: ${validation.errors.map(e => e.message).join('; ')}` };
        }

        // 2. Generate WGSL
        const layout: PropertyLayout[] = [{ name: 'alive', offset: 0, channels: 1, type: 'f32' }];
        const codegenStart = performance.now();
        const wgsl = generateWGSL(CONWAY_GOL_IR, conwayCodegenConfig(layout));
        const codegenMs = performance.now() - codegenStart;

        // 3. Initialize GPU
        const ctx = await GPUContext.initialize();

        // 4. Create buffers for 16×16 grid (small, easy to verify)
        const W = 16, H = 16;
        const bufMgr = new BufferManager();
        bufMgr.initialize({
          width: W, height: H, depth: 1,
          properties: [{ name: 'alive', channels: 1, type: 'f32', defaultValue: [0] }],
        });

        // 5. Seed a glider pattern at (1,0), (2,1), (0,2), (1,2), (2,2)
        //    Standard glider in GoL (top-left origin):
        //    .X.
        //    ..X
        //    XXX
        const data = new Float32Array(W * H);
        const set = (x: number, y: number) => { data[y * W + x] = 1.0; };
        set(1, 0); set(2, 1); set(0, 2); set(1, 2); set(2, 2);
        bufMgr.uploadToRead(data);

        // 6. Compile shader
        const compiler = new ShaderCompiler();
        const dispatcher = new ComputeDispatcher(compiler);
        const compileStart = performance.now();
        const pipeline = dispatcher.createPipeline({ wgsl, label: 'conway-ir-test', workgroupSize: [8, 8, 1] });
        const compileMs = performance.now() - compileStart;

        // 7. Update params uniform
        bufMgr.updateParams({});

        // Also need to write width/height/stride into params buffer
        // BufferManager.updateParams already handles this via writeParams

        // 8. Create bind group and dispatch
        const bindGroup = dispatcher.createBindGroup(pipeline, [
          { binding: 0, resource: { buffer: bufMgr.getReadBuffer() } },
          { binding: 1, resource: { buffer: bufMgr.getWriteBuffer() } },
          { binding: 2, resource: { buffer: bufMgr.getParamsBuffer() } },
        ]);

        const dispatchStart = performance.now();
        const workgroups = ComputeDispatcher.calcWorkgroups([W, H, 1], [8, 8, 1]);
        dispatcher.dispatchAndSubmit(pipeline, bindGroup, workgroups);
        await ctx.device.queue.onSubmittedWorkDone();
        const dispatchMs = performance.now() - dispatchStart;

        // 9. Swap and readback
        bufMgr.swap();
        const readbackStart = performance.now();
        const result = await bufMgr.readBack();
        const readbackMs = performance.now() - readbackStart;

        // 10. Verify glider moved
        // After 1 tick, standard glider (1,0),(2,1),(0,2),(1,2),(2,2) becomes:
        //   (0,1),(2,1),(1,2),(2,2),(1,3)
        const alive = (x: number, y: number) => result[y * W + x] > 0.5;
        const expectedAlive = [[0, 1], [2, 1], [1, 2], [2, 2], [1, 3]];
        const expectedDead = [[1, 0], [0, 2]]; // These were alive before, should be dead now

        let correct = true;
        const issues: string[] = [];
        for (const [x, y] of expectedAlive) {
          if (!alive(x, y)) {
            correct = false;
            issues.push(`(${x},${y}) should be alive but isn't`);
          }
        }
        for (const [x, y] of expectedDead) {
          if (alive(x, y)) {
            correct = false;
            issues.push(`(${x},${y}) should be dead but is alive`);
          }
        }

        // Count total alive cells (should be 5)
        let aliveCount = 0;
        for (let i = 0; i < W * H; i++) {
          if (result[i] > 0.5) aliveCount++;
        }
        if (aliveCount !== 5) {
          correct = false;
          issues.push(`Expected 5 alive cells, got ${aliveCount}`);
        }

        // 11. Clean up
        bufMgr.destroy();

        const totalMs = valMs + codegenMs + compileMs + dispatchMs + readbackMs;
        const summary = [
          correct ? 'IR→WGSL→GPU pipeline PASSED: glider advanced correctly' : 'IR→WGSL→GPU pipeline FAILED',
          ...(issues.length > 0 ? issues.map(i => `  ! ${i}`) : []),
          `  Alive cells: ${aliveCount} (expected 5)`,
          `  Validate: ${valMs.toFixed(1)}ms`,
          `  Codegen: ${codegenMs.toFixed(1)}ms`,
          `  Compile: ${compileMs.toFixed(1)}ms`,
          `  Dispatch: ${dispatchMs.toFixed(1)}ms`,
          `  Readback: ${readbackMs.toFixed(1)}ms`,
          `  Total: ${totalMs.toFixed(1)}ms`,
        ].join('\n');

        return { success: correct, data: { summary } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `IR test failed: ${message}` };
      }
    },
  });

  registry.register({
    name: 'ir.show',
    description: 'Show generated WGSL and Python from Conway IR',
    category: 'ir',
    params: ShowParams,
    execute: async (params) => {
      const { preset } = params as z.infer<typeof ShowParams>;
      let program = CONWAY_GOL_IR;
      let config = conwayCodegenConfig([{ name: 'alive', offset: 0, channels: 1, type: 'f32' }]);

      if (preset === 'fade') {
        const { AGE_FADE_IR } = await import('../../engine/ir/__tests__/referencePrograms');
        program = AGE_FADE_IR;
        config = {
          ...config,
          propertyLayout: [
            { name: 'alive', offset: 0, channels: 1, type: 'f32' },
            { name: 'age', offset: 1, channels: 1, type: 'f32' },
            { name: 'alpha', offset: 2, channels: 1, type: 'f32' },
          ],
        };
      } else if (preset === 'gray-scott') {
        const { GRAY_SCOTT_IR } = await import('../../engine/ir/__tests__/referencePrograms');
        program = GRAY_SCOTT_IR;
        config = {
          ...config,
          propertyLayout: [
            { name: 'u', offset: 0, channels: 1, type: 'f32' },
            { name: 'v', offset: 1, channels: 1, type: 'f32' },
          ],
          envParams: ['Du', 'Dv', 'F', 'k', 'dt'],
        };
      }

      const wgsl = generateWGSL(program, config);
      const python = generatePython(program);

      const summary = [
        `=== WGSL (${preset ?? 'conway'}) ===`,
        wgsl,
        '',
        `=== Python (${preset ?? 'conway'}) ===`,
        python,
      ].join('\n');

      return { success: true, data: { summary } };
    },
  });
}
