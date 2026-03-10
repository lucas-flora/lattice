/**
 * Unit tests for screenshot export utilities.
 *
 * GUIP-05: Screenshot capture and download.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureScreenshot, generateScreenshotFilename, downloadDataUrl } from '../screenshotExport';

describe('Screenshot Export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('TestScreenshot_CaptureReturnsDataUrl', () => {
    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,abc123'),
    } as unknown as HTMLCanvasElement;

    const result = captureScreenshot(mockCanvas);
    expect(result).toBe('data:image/png;base64,abc123');
    expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('TestScreenshot_GenerateFilename_ContainsPrefix', () => {
    const filename = generateScreenshotFilename('lattice');
    expect(filename.startsWith('lattice-')).toBe(true);
    expect(filename.endsWith('.png')).toBe(true);
  });

  it('TestScreenshot_GenerateFilename_DefaultPrefix', () => {
    const filename = generateScreenshotFilename();
    expect(filename.startsWith('lattice-')).toBe(true);
    expect(filename.endsWith('.png')).toBe(true);
  });

  it('TestScreenshot_GenerateFilename_CustomPrefix', () => {
    const filename = generateScreenshotFilename('viewport');
    expect(filename.startsWith('viewport-')).toBe(true);
    expect(filename.endsWith('.png')).toBe(true);
  });

  it('TestScreenshot_GenerateFilename_ContainsTimestamp', () => {
    const filename = generateScreenshotFilename();
    // Should match pattern like lattice-2026-03-10-143052.png
    const pattern = /^lattice-\d{4}-\d{2}-\d{2}-\d{6}\.png$/;
    expect(filename).toMatch(pattern);
  });

  it('TestScreenshot_DownloadDataUrl_CreatesAnchor', () => {
    const mockLink = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockLink as unknown as HTMLAnchorElement;
      return originalCreateElement(tag);
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(mockLink as unknown as Node);
    const removeSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(mockLink as unknown as Node);

    downloadDataUrl('data:image/png;base64,test', 'test.png');

    expect(mockLink.href).toBe('data:image/png;base64,test');
    expect(mockLink.download).toBe('test.png');
    expect(mockLink.click).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });
});
