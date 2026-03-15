/**
 * Pyodide Web Worker: loads CPython WASM and executes Python rule code.
 *
 * Separate from the simulation worker — Pyodide loads ~16MB into memory.
 * The simulation worker stays lightweight for built-in TS/WASM presets.
 *
 * All Python execution is wrapped in try/catch — errors are sent as
 * messages, never crash the worker.
 */

import type { PyodideInMessage, PyodideOutMessage } from './types';
import { buildPythonHarness } from './pythonHarness';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;

function post(msg: PyodideOutMessage): void {
  ctx.postMessage(msg);
}

async function handleInit(indexURL?: string): Promise<void> {
  try {
    post({ type: 'init-progress', phase: 'loading-pyodide', progress: 0 });

    // Import loadPyodide from the npm package
    const { loadPyodide } = await import('pyodide');

    post({ type: 'init-progress', phase: 'loading-pyodide', progress: 0.3 });

    pyodide = await loadPyodide({
      indexURL: indexURL ?? 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/',
    });

    post({ type: 'init-progress', phase: 'loading-numpy', progress: 0.7 });

    // Load numpy micropip-free (it's included in Pyodide's standard packages)
    await pyodide.loadPackage('numpy');

    post({ type: 'init-progress', phase: 'ready', progress: 1.0 });
    post({ type: 'ready' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: 'error', message: `Pyodide init failed: ${message}` });
  }
}

async function handleExecRule(
  id: string,
  code: string,
  buffers: Record<string, Float32Array>,
  gridWidth: number,
  gridHeight: number,
  gridDepth: number,
  params: Record<string, number>,
): Promise<void> {
  if (!pyodide) {
    post({ type: 'error', id, message: 'Pyodide not initialized' });
    return;
  }

  try {
    const propertyNames = Object.keys(buffers);
    const harness = buildPythonHarness(code, propertyNames, gridWidth, gridHeight, gridDepth);

    // Inject input buffers and params into Python globals
    const globals = pyodide.globals;
    const inputBuffers = pyodide.toPy(
      Object.fromEntries(
        Object.entries(buffers).map(([k, v]) => [k, Array.from(v)]),
      ),
    );
    globals.set('_input_buffers', inputBuffers);
    globals.set('_input_params', pyodide.toPy(params));

    // Execute the harness + user code
    await pyodide.runPythonAsync(harness);

    // Extract output buffers
    const outputProxy = globals.get('_output_buffers');
    const resultBuffers: Record<string, Float32Array> = {};

    for (const name of propertyNames) {
      if (outputProxy.has(name)) {
        const pyArray = outputProxy.get(name);
        const jsArray = pyArray.toJs();
        resultBuffers[name] = new Float32Array(jsArray);
        pyArray.destroy();
      }
    }

    // Cleanup Python-side references
    outputProxy.destroy();
    inputBuffers.destroy();
    globals.delete('_input_buffers');
    globals.delete('_input_params');
    globals.delete('_output_buffers');

    post({ type: 'rule-result', id, buffers: resultBuffers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    post({ type: 'error', id, message, stack });
  }
}

function handleDispose(): void {
  pyodide = null;
  post({ type: 'disposed' });
}

ctx.addEventListener('message', (event: MessageEvent<PyodideInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      void handleInit(msg.indexURL);
      break;
    case 'exec-rule':
      void handleExecRule(
        msg.id,
        msg.code,
        msg.buffers,
        msg.gridWidth,
        msg.gridHeight,
        msg.gridDepth,
        msg.params,
      );
      break;
    case 'dispose':
      handleDispose();
      break;
  }
});
