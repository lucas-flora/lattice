/**
 * Unit tests for RAG documentation content.
 *
 * GUIP-06: Full app documentation for AI RAG embedding.
 */

import { describe, it, expect } from 'vitest';
import { LATTICE_APP_DOCS, getAppDocCount, getAppDocTitles } from '../ragDocuments';

describe('RAG App Documentation', () => {
  it('TestRagDocs_HasSufficientDocuments', () => {
    // Phase 8 seeded 13 docs. Phase 10 adds comprehensive app docs.
    expect(getAppDocCount()).toBeGreaterThanOrEqual(10);
  });

  it('TestRagDocs_AllDocsHaveRequiredFields', () => {
    for (const doc of LATTICE_APP_DOCS) {
      expect(doc.title).toBeTruthy();
      expect(doc.content).toBeTruthy();
      expect(doc.category).toBeTruthy();
      expect(doc.source).toBe('lattice-app-docs');
    }
  });

  it('TestRagDocs_CoversMajorFeatures', () => {
    const titles = getAppDocTitles();
    // Must cover overview, architecture, controls, rendering, WASM, AI, etc.
    expect(titles.some((t) => t.toLowerCase().includes('overview'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('architecture') || t.toLowerCase().includes('engine'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('control') || t.toLowerCase().includes('shortcut'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('render'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('wasm'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('ai') || t.toLowerCase().includes('assistant'))).toBe(true);
  });

  it('TestRagDocs_ContentLengthSufficient', () => {
    // Each doc should have meaningful content (at least 50 chars)
    for (const doc of LATTICE_APP_DOCS) {
      expect(doc.content.length).toBeGreaterThan(50);
    }
  });

  it('TestRagDocs_CategoriesAreDefined', () => {
    const categories = new Set(LATTICE_APP_DOCS.map((d) => d.category));
    // Should have diverse categories
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('TestRagDocs_IncludesScreenshotAndGraphDocs', () => {
    const titles = getAppDocTitles();
    expect(titles.some((t) => t.toLowerCase().includes('screenshot'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('parameter') || t.toLowerCase().includes('visualization'))).toBe(true);
  });
});
