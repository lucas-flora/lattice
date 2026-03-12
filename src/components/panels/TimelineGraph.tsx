/**
 * TimelineGraph: generation-locked sparkline with playhead indicator.
 *
 * Unlike ParamGraph (live ring buffer), TimelineGraph shows data indexed by
 * generation number and displays a vertical playhead synced to the simulation.
 * All TimelineGraphs scrub together when the playhead moves.
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { GraphSample } from '@/lib/paramGraphData';
import { samplesToTimelinePoints } from '@/lib/paramGraphData';

interface TimelineGraphProps {
  label: string;
  samples: GraphSample[];
  currentGeneration: number;
  maxGeneration: number;
  valueAtPlayhead?: number;
  formatValue?: (value: number) => string;
  width?: number;
  height?: number;
  testId?: string;
}

const GRAPH_COLOR = '#4ade80'; // green-400
const PLAYHEAD_COLOR = '#4ade80'; // green-400
const GRID_COLOR = '#27272a'; // zinc-800

export function TimelineGraph({
  label,
  samples,
  currentGeneration,
  maxGeneration,
  valueAtPlayhead,
  formatValue,
  width = 260,
  height = 60,
  testId,
}: TimelineGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round((height / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw sparkline mapped by generation
    const genEnd = Math.max(maxGeneration, 1);
    const points = samplesToTimelinePoints(samples, width, height, 0, genEnd);
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

      // Fill under curve
      ctx.fillStyle = `${GRAPH_COLOR}15`;
      ctx.beginPath();
      ctx.moveTo(points[0][0], height);
      for (const [x, y] of points) {
        ctx.lineTo(x, y);
      }
      ctx.lineTo(points[points.length - 1][0], height);
      ctx.closePath();
      ctx.fill();
    }

    // Draw playhead line
    if (genEnd > 0 && currentGeneration >= 0) {
      const playheadX = Math.round((currentGeneration / genEnd) * width) + 0.5;
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small playhead triangle at top
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX - 3, -1);
      ctx.lineTo(playheadX + 3, -1);
      ctx.closePath();
      ctx.fill();
    }
  }, [samples, width, height, currentGeneration, maxGeneration]);

  useEffect(() => {
    draw();
  }, [draw]);

  const displayValue = valueAtPlayhead !== undefined
    ? (formatValue ? formatValue(valueAtPlayhead) : valueAtPlayhead.toLocaleString())
    : '\u2014';

  return (
    <div data-testid={testId ?? `timeline-graph-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            {label}
          </span>
        </div>
        <span
          className="text-xs font-mono text-green-400"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          data-testid={`timeline-graph-value-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          @{currentGeneration}: {displayValue}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded border border-zinc-800"
        style={{ overflow: 'visible' }}
        data-testid={`timeline-graph-canvas-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
    </div>
  );
}
