/**
 * Unit tests for Personality configuration.
 *
 * Verifies the centralized personality config structure and
 * system prompt template interpolation.
 */

import { describe, it, expect } from 'vitest';
import { PERSONALITY, buildSystemPrompt } from '../personality';
import type { AiContext } from '../types';

function makeContext(overrides: Partial<AiContext> = {}): AiContext {
  return {
    presetName: "Conway's Game of Life",
    generation: 42,
    gridWidth: 128,
    gridHeight: 128,
    liveCellCount: 500,
    isRunning: true,
    speed: 10,
    recentActions: ['sim play'],
    availableCommands: [
      { name: 'sim.play', description: 'Start simulation' },
      { name: 'sim.pause', description: 'Pause simulation' },
    ],
    ...overrides,
  };
}

describe('Personality', () => {
  it('TestPersonality_ExportsConfig', () => {
    expect(PERSONALITY.name).toBeDefined();
    expect(PERSONALITY.systemPromptTemplate).toBeDefined();
    expect(PERSONALITY.tone).toBeDefined();
    expect(PERSONALITY.maxResponseTokens).toBeDefined();
    expect(typeof PERSONALITY.maxResponseTokens).toBe('number');
  });

  it('TestPersonality_ConfigValues', () => {
    expect(PERSONALITY.name).toBe('Lattice AI');
    expect(PERSONALITY.tone).toBe('concise-technical');
    expect(PERSONALITY.maxResponseTokens).toBeGreaterThan(0);
    expect(PERSONALITY.includeConversationHistory).toBe(true);
    expect(PERSONALITY.maxConversationTurns).toBeGreaterThan(0);
  });

  it('TestPersonality_BuildSystemPrompt_IncludesContext', () => {
    const context = makeContext();
    const prompt = buildSystemPrompt(context);

    expect(prompt).toContain("Conway's Game of Life");
    expect(prompt).toContain('42');
    expect(prompt).toContain('128');
    expect(prompt).toContain('500');
    expect(prompt).toContain('Yes'); // isRunning
    expect(prompt).toContain('10 FPS'); // speed
    expect(prompt).toContain('sim.play');
    expect(prompt).toContain('sim.pause');
  });

  it('TestPersonality_BuildSystemPrompt_IncludesRagDocs', () => {
    const context = makeContext();
    const ragDocs = ['According to "GoL Patterns": Gliders move diagonally.'];
    const prompt = buildSystemPrompt(context, ragDocs);

    expect(prompt).toContain('Reference Material');
    expect(prompt).toContain('Gliders move diagonally');
  });

  it('TestPersonality_BuildSystemPrompt_WorksWithoutRag', () => {
    const context = makeContext();
    const prompt = buildSystemPrompt(context);

    // Should be valid without RAG — no "Reference Material" section
    expect(prompt).not.toContain('Reference Material');
    expect(prompt).toContain('Lattice AI');
    expect(prompt).toContain("Conway's Game of Life");
  });

  it('TestPersonality_BuildSystemPrompt_HandlesNullPreset', () => {
    const context = makeContext({ presetName: null });
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('None');
  });

  it('TestPersonality_BuildSystemPrompt_HandlesMaxSpeed', () => {
    const context = makeContext({ speed: 0 });
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('max');
  });

  it('TestPersonality_SystemPromptContainsCommandInstructions', () => {
    const prompt = buildSystemPrompt(makeContext());
    expect(prompt).toContain('action');
    expect(prompt).toContain('command');
    expect(prompt).toContain('Typo Correction');
  });
});
