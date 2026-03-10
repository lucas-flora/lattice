/**
 * Unit tests for typo detection and Levenshtein distance.
 *
 * Verifies accurate detection of misspelled commands and
 * correct edit distance calculation.
 */

import { describe, it, expect } from 'vitest';
import { levenshtein, detectPossibleTypo } from '../typoDetector';

const COMMAND_NAMES = [
  'sim.play',
  'sim.pause',
  'sim.step',
  'sim.stepBack',
  'sim.reset',
  'sim.clear',
  'sim.speed',
  'sim.seek',
  'sim.status',
  'preset.load',
  'preset.list',
  'edit.draw',
  'edit.erase',
  'edit.brushSize',
  'edit.undo',
  'edit.redo',
  'view.zoom',
  'view.pan',
  'view.fit',
  'ui.toggleTerminal',
  'ui.toggleParamPanel',
];

describe('Levenshtein Distance', () => {
  it('TestLevenshtein_ExactMatch', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('TestLevenshtein_SingleInsertion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });

  it('TestLevenshtein_SingleDeletion', () => {
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('TestLevenshtein_SingleSubstitution', () => {
    expect(levenshtein('abc', 'axc')).toBe(1);
  });

  it('TestLevenshtein_CompletelyDifferent', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });

  it('TestLevenshtein_EmptyStrings', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('TestLevenshtein_Symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
  });
});

describe('Typo Detector', () => {
  it('TestTypoDetector_DetectsSimPlayTypo', () => {
    const result = detectPossibleTypo('sim plya', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    expect(result.hint).toContain('sim play');
  });

  it('TestTypoDetector_DetectsPresetLoadTypo', () => {
    const result = detectPossibleTypo('prset load', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    expect(result.hint).toContain('preset');
  });

  it('TestTypoDetector_IgnoresNaturalLanguage', () => {
    const result = detectPossibleTypo('tell me about conway', COMMAND_NAMES);
    expect(result.isTypo).toBe(false);
  });

  it('TestTypoDetector_IgnoresLongInput', () => {
    const result = detectPossibleTypo(
      'please load the gray scott preset for me',
      COMMAND_NAMES,
    );
    expect(result.isTypo).toBe(false);
  });

  it('TestTypoDetector_HandlesSingleWordTypo', () => {
    const result = detectPossibleTypo('smi', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    expect(result.hint).toContain('sim');
  });

  it('TestTypoDetector_ReturnsClosestMatch', () => {
    const result = detectPossibleTypo('sim paly', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    // "paly" is closest to "play" (distance 2 via transposition)
    expect(result.hint).toContain('sim');
  });

  it('TestTypoDetector_EmptyInputNotTypo', () => {
    const result = detectPossibleTypo('', COMMAND_NAMES);
    expect(result.isTypo).toBe(false);
  });

  it('TestTypoDetector_FourWordInputNotTypo', () => {
    const result = detectPossibleTypo('what is this simulation', COMMAND_NAMES);
    expect(result.isTypo).toBe(false);
  });

  it('TestTypoDetector_DetectsEditTypo', () => {
    const result = detectPossibleTypo('eidt draw', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    expect(result.hint).toContain('edit');
  });

  it('TestTypoDetector_DetectsViewTypo', () => {
    const result = detectPossibleTypo('veiw zoom', COMMAND_NAMES);
    expect(result.isTypo).toBe(true);
    expect(result.hint).toContain('view');
  });
});
