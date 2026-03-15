/**
 * Easing functions and range mapping for parameter links.
 *
 * Pure math — no dependencies. Operates on both scalars and typed arrays.
 */

import type { EasingType } from './types';

/** Apply an easing function to a normalized [0,1] value */
export function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'linear':
      return t;
    case 'smoothstep':
      return t * t * (3 - 2 * t);
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    default:
      return t;
  }
}

/** Map a scalar from source range to target range with easing. Clamps to source range. */
export function rangeMap(
  value: number,
  srcRange: [number, number],
  dstRange: [number, number],
  easing: EasingType,
): number {
  const [srcMin, srcMax] = srcRange;
  const [dstMin, dstMax] = dstRange;

  // Normalize to [0,1], clamped
  const span = srcMax - srcMin;
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (value - srcMin) / span));

  // Apply easing
  const eased = applyEasing(t, easing);

  // Denormalize to target range
  return dstMin + eased * (dstMax - dstMin);
}

/** Vectorized range mapping: reads src array, writes mapped values to out array */
export function rangeMapArray(
  src: Float32Array,
  out: Float32Array,
  srcRange: [number, number],
  dstRange: [number, number],
  easing: EasingType,
): void {
  const [srcMin, srcMax] = srcRange;
  const [dstMin, dstMax] = dstRange;
  const span = srcMax - srcMin;
  const invSpan = span === 0 ? 0 : 1 / span;
  const dstSpan = dstMax - dstMin;
  const len = Math.min(src.length, out.length);

  for (let i = 0; i < len; i++) {
    // Normalize + clamp
    const t = Math.max(0, Math.min(1, (src[i] - srcMin) * invSpan));
    // Ease + denormalize
    out[i] = dstMin + applyEasing(t, easing) * dstSpan;
  }
}
