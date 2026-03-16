/**
 * Expression harness: builds a single Python script evaluating ALL per-property
 * expressions in one worker call.
 *
 * Sets up numpy arrays for each property, env params, global vars, and
 * built-in helper functions. Expressions read from current buffers and
 * write to output buffers.
 */

/**
 * Build a Python script that evaluates all expressions in one call.
 *
 * @param expressions - Map of property name → Python expression string
 * @param propertyNames - All grid property names (for buffer setup)
 * @param width - Grid width
 * @param height - Grid height
 * @param depth - Grid depth
 */
export function buildExpressionHarness(
  expressions: Record<string, string>,
  propertyNames: string[],
  width: number,
  height: number,
  depth: number,
): string {
  const propList = propertyNames.map((n) => `'${n}'`).join(', ');
  const exprEntries = Object.entries(expressions);

  const exprBlocks = exprEntries
    .map(([prop, expr]) => {
      return `
# Expression for '${prop}'
try:
    value = cell['${prop}']
    _expr_result = ${expr}
    if isinstance(_expr_result, np.ndarray):
        _output_buffers['${prop}'] = _expr_result.astype(np.float32).ravel()
    else:
        _output_buffers['${prop}'] = np.full(width * height, float(_expr_result), dtype=np.float32)
except Exception as _e:
    pass  # Expression errors are silently skipped
`;
    })
    .join('\n');

  // Build shorthand variable assignments for cell properties and globals
  // so users can write `age / 100` instead of `cell["age"] / 100`
  const propShorthands = propertyNames
    .map((n) => `${n} = cell['${n}']`)
    .join('\n');

  return `
import numpy as np
import math

# Grid dimensions
width = ${width}
height = ${height}
depth = ${depth}

# Build cell dict from flat buffers
cell = {}
for name in [${propList}]:
    flat = _input_buffers[name]
    arr = np.array(flat, dtype=np.float32)
    if height > 1:
        arr = arr.reshape((height, width))
    cell[name] = arr

# Shorthand: property names as local variables (e.g. age, alive, alpha)
${propShorthands}

# Environment params and global vars
env = dict(_input_params)
glob = dict(_input_globals)
generation = env.get('_generation', 0)
dt = env.get('_dt', 1.0)
time = generation * dt

# Shorthand: global variables as local variables (e.g. ageLimit, threshold)
for _k, _v in glob.items():
    if not _k.startswith('_'):
        globals()[_k] = _v

# Built-in helper functions
def clamp(x, lo=0.0, hi=1.0):
    return np.clip(x, lo, hi)

def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0 + 1e-10), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def linear(x, in_lo, in_hi, out_lo=0.0, out_hi=1.0):
    t = (x - in_lo) / (in_hi - in_lo + 1e-10)
    return out_lo + t * (out_hi - out_lo)

def wiggle(amplitude=1.0, frequency=1.0):
    return amplitude * np.sin(2.0 * math.pi * frequency * time)

# Output starts as copy of input
_output_buffers = {}
for name in cell:
    _output_buffers[name] = cell[name].astype(np.float32).ravel()

# --- Evaluate expressions ---
${exprBlocks}
`;
}
