/**
 * Screenshot export utility.
 *
 * GUIP-05: Export the current viewport as a PNG file.
 * Uses canvas.toDataURL('image/png') and triggers a download via anchor click.
 */

/**
 * Capture a screenshot from a canvas element and return as a data URL.
 *
 * @param canvas - The HTMLCanvasElement to capture
 * @returns PNG data URL string
 */
export function captureScreenshot(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Download a data URL as a file.
 *
 * @param dataUrl - The data URL to download
 * @param filename - The filename for the download
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate a timestamped filename for screenshots.
 *
 * @param prefix - Filename prefix (default: 'lattice')
 * @returns Filename like 'lattice-2026-03-10-143052.png'
 */
export function generateScreenshotFilename(prefix: string = 'lattice'): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${timestamp}.png`;
}

/**
 * Capture and download a screenshot from a canvas element.
 *
 * @param canvas - The HTMLCanvasElement to capture
 * @param filename - Optional filename override
 */
export function exportScreenshot(canvas: HTMLCanvasElement, filename?: string): void {
  const dataUrl = captureScreenshot(canvas);
  const name = filename ?? generateScreenshotFilename();
  downloadDataUrl(dataUrl, name);
}
