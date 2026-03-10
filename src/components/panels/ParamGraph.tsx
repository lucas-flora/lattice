/**
 * ParamGraph: sparkline-style parameter visualization.
 *
 * GUIP-02: Displays a live-updating sparkline graph for a simulation metric.
 * Uses canvas 2D context for efficient rendering.
 * Green (#4ade80) line on transparent background, consistent with Lattice theme.
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { GraphSample } from '@/lib/paramGraphData';
import { samplesToSparklinePoints } from '@/lib/paramGraphData';

interface ParamGraphProps {
  /** Display label for the metric */
  label: string;
  /** Current samples to render */
  samples: GraphSample[];
  /** Current value to display as text */
  currentValue: number;
  /** Format function for the current value display */
  formatValue?: (value: number) => string;
  /** Width of the graph canvas in pixels */
  width?: number;
  /** Height of the graph canvas in pixels */
  height?: number;
  /** Test ID for the container */
  testId?: string;
}

const GRAPH_COLOR = '#4ade80'; // green-400
const GRID_COLOR = '#27272a'; // zinc-800

export function ParamGraph({
  label,
  samples,
  currentValue,
  formatValue,
  width = 260,
  height = 60,
  testId,
}: ParamGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw grid lines (3 horizontal)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round((height / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw sparkline
    const points = samplesToSparklinePoints(samples, width, height);
    if (points.length > 1) {
      ctx.strokeStyle = GRAPH_COLOR;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();

      // Fill area under curve
      ctx.fillStyle = `${GRAPH_COLOR}15`; // 8% opacity
      ctx.beginPath();
      ctx.moveTo(points[0][0], height);
      for (const [x, y] of points) {
        ctx.lineTo(x, y);
      }
      ctx.lineTo(points[points.length - 1][0], height);
      ctx.closePath();
      ctx.fill();
    }
  }, [samples, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  const displayValue = formatValue ? formatValue(currentValue) : currentValue.toLocaleString();

  return (
    <div data-testid={testId ?? `param-graph-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
        <span
          className="text-xs font-mono text-green-400"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          data-testid={`param-graph-value-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {displayValue}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded border border-zinc-800"
        data-testid={`param-graph-canvas-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
    </div>
  );
}
