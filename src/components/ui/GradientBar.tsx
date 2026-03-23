/**
 * GradientBar: canvas-rendered color ramp preview.
 *
 * Draws a horizontal gradient from an array of color stops.
 * Used in the Inspector's VisualSection for color ramp editing.
 */

import React, { useRef, useEffect } from 'react';

export interface GradientStop {
  t: number;
  color: string; // hex "#rrggbb"
}

interface GradientBarProps {
  stops: GradientStop[];
  width?: number;
  height?: number;
  className?: string;
  /** Called with normalized position [0,1] when clicking on the bar */
  onClick?: (t: number) => void;
}

export const GradientBar: React.FC<GradientBarProps> = ({
  stops,
  width = 200,
  height = 20,
  className = '',
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sorted = [...stops].sort((a, b) => a.t - b.t);
    if (sorted.length === 0) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (const stop of sorted) {
      gradient.addColorStop(Math.max(0, Math.min(1, stop.t)), stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [stops, width, height]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - rect.left) / rect.width;
    onClick(Math.max(0, Math.min(1, t)));
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`rounded-sm ${onClick ? 'cursor-crosshair' : ''} ${className}`}
      style={{ width: '100%', height: `${height}px` }}
      onClick={handleClick}
    />
  );
};
