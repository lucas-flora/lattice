/**
 * RampCompiler: converts visual mapping ramp configurations into IRPrograms.
 *
 * A ramp maps a cell property value through a multi-stop color gradient,
 * writing the result to colorR/G/B (and optionally alpha). The generated IR
 * uses nested select/mix/smoothstep chains — no loops, pure expression trees.
 *
 * Pipeline: RampConfig → compileRampToIR() → IRProgram → WGSLCodegen → GPU compute
 */

import { IR } from './IRBuilder';
import type { IRNode, IRStatement, IRProgram, IRPropertyDescriptor } from './types';

// ── Public types ──

export interface ColorStop {
  t: number;
  color: string; // hex "#rrggbb"
}

export interface AlphaStop {
  t: number;
  alpha: number; // 0–1
}

/** A single stop that may have color and/or alpha (from YAML/Zod parsing) */
export interface GenericStop {
  t: number;
  color?: string;
  alpha?: number;
}

export interface RampMapping {
  property: string;
  channel: 'color' | 'alpha';
  type: 'ramp';
  range?: [number, number];
  stops: GenericStop[];
  cell_type?: string;
}

// ── Helpers ──

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function hasColor(stop: GenericStop): stop is GenericStop & { color: string } {
  return typeof stop.color === 'string';
}

function hasAlpha(stop: GenericStop): stop is GenericStop & { alpha: number } {
  return typeof stop.alpha === 'number';
}

/**
 * Build a single-channel ramp expression from sorted stops.
 *
 * For N stops, produces N-1 segments as a right-to-left nested select tree:
 *   select(t < s1.t, mix(s0, s1, smoothstep(s0.t, s1.t, t)),
 *     select(t < s2.t, mix(s1, s2, smoothstep(...)), ...))
 */
function buildRampChannel(stops: { t: number; value: number }[], tVar: IRNode): IRNode {
  if (stops.length === 0) return IR.f32(0);
  if (stops.length === 1) return IR.f32(stops[0].value);

  // Two stops: single mix/smoothstep
  if (stops.length === 2) {
    return IR.mix(
      IR.f32(stops[0].value),
      IR.f32(stops[1].value),
      IR.smoothstep(IR.f32(stops[0].t), IR.f32(stops[1].t), tVar),
    );
  }

  // Last segment is the else branch
  const last = stops.length - 1;
  let result: IRNode = IR.mix(
    IR.f32(stops[last - 1].value),
    IR.f32(stops[last].value),
    IR.smoothstep(IR.f32(stops[last - 1].t), IR.f32(stops[last].t), tVar),
  );

  // Build right-to-left
  for (let i = last - 2; i >= 0; i--) {
    const segment = IR.mix(
      IR.f32(stops[i].value),
      IR.f32(stops[i + 1].value),
      IR.smoothstep(IR.f32(stops[i].t), IR.f32(stops[i + 1].t), tVar),
    );
    result = IR.select(IR.lt(tVar, IR.f32(stops[i + 1].t)), segment, result);
  }

  return result;
}

// ── Main compiler ──

/**
 * Compile an array of ramp mappings into a single IRProgram that writes
 * colorR/G/B and/or alpha to the output buffer.
 */
export function compileRampToIR(mappings: RampMapping[]): IRProgram {
  const statements: IRStatement[] = [];
  const inputs: IRPropertyDescriptor[] = [];
  const outputs: IRPropertyDescriptor[] = [];
  const seenInputs = new Set<string>();
  const seenOutputs = new Set<string>();

  function addInput(property: string) {
    if (!seenInputs.has(property)) {
      seenInputs.add(property);
      inputs.push({ property, scope: 'cell', type: 'f32' });
    }
  }

  function addOutput(property: string) {
    if (!seenOutputs.has(property)) {
      seenOutputs.add(property);
      outputs.push({ property, scope: 'cell', type: 'f32' });
    }
  }

  for (const mapping of mappings) {
    if (mapping.type !== 'ramp' || !mapping.stops || mapping.stops.length === 0) continue;

    const range = mapping.range ?? [0, 1];
    const rangeMin = range[0];
    const rangeSpan = range[1] - range[0];

    // Sort stops by position
    const sortedStops = [...mapping.stops].sort((a, b) => a.t - b.t);

    addInput(mapping.property);

    // Declare normalized t variable: clamp((value - min) / span, 0, 1)
    const tVarName = `t_${mapping.property}_${mapping.channel}`;
    const rawRead = IR.readCell(mapping.property);
    const normalized = rangeSpan === 1 && rangeMin === 0
      ? IR.clamp(rawRead, IR.f32(0), IR.f32(1))
      : IR.clamp(
          IR.div(IR.sub(rawRead, IR.f32(rangeMin)), IR.f32(rangeSpan)),
          IR.f32(0),
          IR.f32(1),
        );
    statements.push(IR.declareVar(tVarName, 'f32', normalized));
    const tVar = IR.varRef(tVarName);

    if (mapping.channel === 'color') {
      // Extract R, G, B channels from color stops
      const colorStops = sortedStops.filter(hasColor);
      if (colorStops.length === 0) continue;

      const rStops = colorStops.map(s => ({ t: s.t, value: hexToRgb01(s.color)[0] }));
      const gStops = colorStops.map(s => ({ t: s.t, value: hexToRgb01(s.color)[1] }));
      const bStops = colorStops.map(s => ({ t: s.t, value: hexToRgb01(s.color)[2] }));

      statements.push(IR.writeProperty('colorR', buildRampChannel(rStops, tVar)));
      statements.push(IR.writeProperty('colorG', buildRampChannel(gStops, tVar)));
      statements.push(IR.writeProperty('colorB', buildRampChannel(bStops, tVar)));

      addOutput('colorR');
      addOutput('colorG');
      addOutput('colorB');
    } else if (mapping.channel === 'alpha') {
      // Alpha stops
      const alphaStops = sortedStops
        .filter(hasAlpha)
        .map(s => ({ t: s.t, value: s.alpha }));
      if (alphaStops.length === 0) continue;

      statements.push(IR.writeProperty('alpha', buildRampChannel(alphaStops, tVar)));
      addOutput('alpha');
    }
  }

  return IR.program(statements, {
    inputs,
    outputs,
    neighborhoodAccess: false,
    metadata: { sourceType: 'builtin' },
  });
}
