/**
 * Python harness: wraps user code with numpy array setup and result extraction.
 *
 * The harness sets up:
 *   - `grid`: dict of numpy 2D arrays (property_name → np.ndarray)
 *   - `result`: dict to write output arrays into (starts as copy of grid)
 *   - `params`: dict of parameter values
 *   - `width`, `height`, `depth`: grid dimensions
 *   - `np` / `numpy`: numpy module reference
 *
 * User code writes to `result` dict. The harness flattens results back to
 * 1D Float32Arrays for transfer to the main thread.
 */

/**
 * Build the full Python script that wraps user code.
 *
 * @param userCode - The user's Python rule body
 * @param propertyNames - Names of all grid properties
 * @param width - Grid width
 * @param height - Grid height
 * @param depth - Grid depth
 */
export function buildPythonHarness(
  userCode: string,
  propertyNames: string[],
  width: number,
  height: number,
  depth: number,
): string {
  const propList = propertyNames.map((n) => `'${n}'`).join(', ');

  return `
import numpy as np

# Grid dimensions
width = ${width}
height = ${height}
depth = ${depth}
numpy = np

# Build grid dict from flat buffers (injected by worker)
grid = {}
for name in [${propList}]:
    flat = _input_buffers[name]
    arr = np.array(flat, dtype=np.float32)
    if height > 1:
        arr = arr.reshape((height, width))
    grid[name] = arr

# Result starts as copy of input
result = {}
for name in grid:
    result[name] = grid[name].copy()

# Params dict (injected by worker)
params = dict(_input_params)

# --- User code begins ---
${userCode}
# --- User code ends ---

# Flatten results back to 1D for transfer
_output_buffers = {}
for name in result:
    _output_buffers[name] = result[name].astype(np.float32).ravel()
`;
}
