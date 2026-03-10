'use client';

import { useEffect, useState, useRef } from 'react';
import type { WorkerInMessage, WorkerOutMessage } from '@/engine/worker/protocol';

export default function Home() {
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<'idle' | 'initialized' | 'running'>('idle');
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Create Worker using the URL pattern supported by Turbopack/webpack
    const worker = new Worker(
      new URL('../engine/worker/simulation.worker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.addEventListener('message', (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'initialized':
          setStatus('initialized');
          setGeneration(msg.generation);
          break;
        case 'tick-result':
          setStatus('running');
          setGeneration(msg.generation);
          break;
        case 'error':
          console.error('Worker error:', msg.message);
          break;
      }
    });

    // Initialize the worker
    worker.postMessage({ type: 'init' } satisfies WorkerInMessage);

    // Send a few ticks to demonstrate
    const tickInterval = setInterval(() => {
      worker.postMessage({ type: 'tick' } satisfies WorkerInMessage);
    }, 500);

    return () => {
      clearInterval(tickInterval);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-sans">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-50">Lattice</h1>
        <p className="max-w-md text-lg leading-8 text-zinc-400">
          Universal simulation substrate.
        </p>
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">Worker Status</p>
          <p className="mt-1 text-2xl font-mono text-zinc-200">{status}</p>
          <p className="mt-4 text-sm text-zinc-500">Generation</p>
          <p className="mt-1 text-4xl font-mono font-bold text-green-400">{generation}</p>
        </div>
      </main>
    </div>
  );
}
