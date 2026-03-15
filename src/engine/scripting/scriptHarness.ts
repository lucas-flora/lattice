/**
 * Script harness: wraps a global script with inputs, outputs, env, glob context.
 *
 * Extracts `outputs` dict after execution (global.* and env.* writes).
 */

/**
 * Build a Python script that runs a global script and extracts outputs.
 *
 * @param userCode - The user's global script body
 * @param inputs - Input variable names the script reads from
 * @param outputs - Output variable names the script writes to
 */
export function buildScriptHarness(
  userCode: string,
  inputs: string[],
  outputs: string[],
  width: number,
  height: number,
  depth: number,
): string {
  return `
import numpy as np
import math

# Grid dimensions
width = ${width}
height = ${height}
depth = ${depth}

# Environment params and global vars
env = dict(_input_params)
glob = dict(_input_globals)
generation = env.get('_generation', 0)
dt = env.get('_dt', 1.0)
time = generation * dt

# Built-in helpers
def clamp(x, lo=0.0, hi=1.0):
    if isinstance(x, (int, float)):
        return max(lo, min(hi, x))
    return np.clip(x, lo, hi)

# --- User script begins ---
${userCode}
# --- User script ends ---

# Extract changes to env and glob
_env_changes = {}
_var_changes = {}
for k, v in env.items():
    if k.startswith('_'):
        continue
    orig = _input_params.get(k)
    if orig is None or float(v) != float(orig):
        _env_changes[k] = float(v)

for k, v in glob.items():
    orig = _input_globals.get(k)
    if orig is None or v != orig:
        if isinstance(v, str):
            _var_changes[k] = v
        else:
            _var_changes[k] = float(v)
`;
}
