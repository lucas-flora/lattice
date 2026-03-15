/**
 * PyodideBridge: main-thread class managing the Pyodide worker lifecycle.
 *
 * Provides a promise-based API for executing Python code. Lazy-initializes
 * the worker on first use. Emits status events via EventBus.
 */

import { eventBus } from '../core/EventBus';
import { createPyodideWorker } from './createPyodideWorker';
import type { PyodideInMessage, PyodideOutMessage, PyodideStatus } from './types';

let idCounter = 0;
function nextId(): string {
  return `py-${++idCounter}`;
}

export class PyodideBridge {
  private worker: Worker | null = null;
  private status: PyodideStatus = 'idle';
  private initPromise: Promise<void> | null = null;

  /** Pending exec-rule and exec-expressions requests awaiting response */
  private pending = new Map<
    string,
    {
      resolve: (buffers: Record<string, Float32Array>) => void;
      reject: (error: Error) => void;
    }
  >();

  /** Pending exec-script requests awaiting response */
  private scriptPending = new Map<
    string,
    {
      resolve: (result: { envChanges: Record<string, number>; varChanges: Record<string, number | string> }) => void;
      reject: (error: Error) => void;
    }
  >();

  /**
   * Lazily initialize Pyodide. Idempotent — returns the same promise
   * if called multiple times.
   */
  ensureReady(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.status = 'loading';
      eventBus.emit('pyodide:loading', { phase: 'starting', progress: 0 });

      this.worker = createPyodideWorker();
      this.worker.addEventListener('message', (event: MessageEvent<PyodideOutMessage>) => {
        this.handleMessage(event.data);
      });

      // Store resolve/reject for the init flow
      const onReady = () => {
        this.status = 'ready';
        eventBus.emit('pyodide:ready', {});
        resolve();
      };

      const onError = (msg: string) => {
        this.status = 'error';
        eventBus.emit('pyodide:error', { message: msg });
        reject(new Error(msg));
      };

      // Attach one-time handlers for init completion
      this._initResolve = onReady;
      this._initReject = onError;

      const msg: PyodideInMessage = { type: 'init' };
      this.worker.postMessage(msg);
    });

    return this.initPromise;
  }

  private _initResolve: (() => void) | null = null;
  private _initReject: ((msg: string) => void) | null = null;

  /**
   * Execute a Python rule on grid buffers. Returns the result buffers.
   */
  async execRule(
    code: string,
    buffers: Record<string, Float32Array>,
    gridWidth: number,
    gridHeight: number,
    gridDepth: number,
    params: Record<string, number>,
  ): Promise<Record<string, Float32Array>> {
    await this.ensureReady();

    const id = nextId();
    return new Promise<Record<string, Float32Array>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const msg: PyodideInMessage = {
        type: 'exec-rule',
        id,
        code,
        buffers,
        gridWidth,
        gridHeight,
        gridDepth,
        params,
      };
      this.worker!.postMessage(msg);
    });
  }

  /**
   * Execute per-property expressions. Returns the modified buffers.
   */
  async execExpressions(
    code: string,
    buffers: Record<string, Float32Array>,
    gridWidth: number,
    gridHeight: number,
    gridDepth: number,
    params: Record<string, number>,
    globalVars: Record<string, number>,
  ): Promise<Record<string, Float32Array>> {
    await this.ensureReady();

    const id = nextId();
    return new Promise<Record<string, Float32Array>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const msg: PyodideInMessage = {
        type: 'exec-expressions',
        id,
        code,
        buffers,
        gridWidth,
        gridHeight,
        gridDepth,
        params,
        globalVars,
      };
      this.worker!.postMessage(msg);
    });
  }

  /**
   * Execute a global script. Returns env and variable changes.
   */
  async execScript(
    code: string,
    params: Record<string, number>,
    globalVars: Record<string, number>,
    gridWidth: number,
    gridHeight: number,
    gridDepth: number,
  ): Promise<{ envChanges: Record<string, number>; varChanges: Record<string, number | string> }> {
    await this.ensureReady();

    const id = nextId();
    return new Promise((resolve, reject) => {
      this.scriptPending.set(id, { resolve, reject });

      const msg: PyodideInMessage = {
        type: 'exec-script',
        id,
        code,
        params,
        globalVars,
        gridWidth,
        gridHeight,
        gridDepth,
      };
      this.worker!.postMessage(msg);
    });
  }

  /**
   * Get the current Pyodide status.
   */
  getStatus(): PyodideStatus {
    return this.status;
  }

  /**
   * Dispose of the worker and cleanup.
   */
  dispose(): void {
    if (this.worker) {
      const msg: PyodideInMessage = { type: 'dispose' };
      this.worker.postMessage(msg);
      this.worker.terminate();
      this.worker = null;
    }
    this.status = 'idle';
    this.initPromise = null;
    this._initResolve = null;
    this._initReject = null;
    // Reject all pending requests
    for (const [, { reject }] of this.pending) {
      reject(new Error('PyodideBridge disposed'));
    }
    this.pending.clear();
    for (const [, { reject }] of this.scriptPending) {
      reject(new Error('PyodideBridge disposed'));
    }
    this.scriptPending.clear();
  }

  private handleMessage(msg: PyodideOutMessage): void {
    switch (msg.type) {
      case 'init-progress':
        eventBus.emit('pyodide:loading', { phase: msg.phase, progress: msg.progress });
        break;

      case 'ready':
        if (this._initResolve) {
          this._initResolve();
          this._initResolve = null;
          this._initReject = null;
        }
        break;

      case 'rule-result': {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.buffers);
        }
        break;
      }

      case 'expression-result': {
        const ep = this.pending.get(msg.id);
        if (ep) {
          this.pending.delete(msg.id);
          ep.resolve(msg.buffers);
        }
        break;
      }

      case 'script-result': {
        const sp = this.scriptPending.get(msg.id);
        if (sp) {
          this.scriptPending.delete(msg.id);
          sp.resolve({ envChanges: msg.envChanges, varChanges: msg.varChanges });
        }
        break;
      }

      case 'error': {
        if (msg.id) {
          // Error for a specific request
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.reject(new Error(msg.message));
          }
          const sp = this.scriptPending.get(msg.id);
          if (sp) {
            this.scriptPending.delete(msg.id);
            sp.reject(new Error(msg.message));
          }
        } else if (this._initReject) {
          // Error during init
          this._initReject(msg.message);
          this._initResolve = null;
          this._initReject = null;
        }
        break;
      }

      case 'disposed':
        // Worker acknowledged dispose
        break;
    }
  }
}
