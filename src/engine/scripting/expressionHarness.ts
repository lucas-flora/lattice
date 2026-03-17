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
      // Detect multi-line / assignment-style code vs single expression
      const isStatement = expr.includes('\n') || expr.includes('=');
      if (isStatement) {
        // Statement mode: exec the code block, then read self.<prop> for output
        const indentedCode = expr.split('\n').map(line => `    ${line}`).join('\n');
        return `
# Expression for '${prop}' (statement mode)
try:
    _self_writes.clear()
${indentedCode}
    if '${prop}' in _self_writes:
        _val = _self_writes['${prop}']
        if isinstance(_val, np.ndarray):
            _output_buffers['${prop}'] = _val.astype(np.float32).ravel()
        elif isinstance(_val, (int, float)):
            _output_buffers['${prop}'] = np.full(_total_cells, float(_val), dtype=np.float32)
except Exception as _e:
    pass  # Expression errors are silently skipped
`;
      } else {
        // Pure expression mode: evaluate and assign to output
        return `
# Expression for '${prop}'
try:
    value = cell['${prop}']
    _expr_result = ${expr}
    if isinstance(_expr_result, np.ndarray):
        _output_buffers['${prop}'] = _expr_result.astype(np.float32).ravel()
    else:
        _output_buffers['${prop}'] = np.full(_total_cells, float(_expr_result), dtype=np.float32)
except Exception as _e:
    pass  # Expression errors are silently skipped
`;
      }
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
_total_cells = ${width * height * Math.max(depth, 1)}

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

# Coordinate arrays (same shape as cell properties)
if height > 1:
    _y_grid, _x_grid = np.mgrid[0:height, 0:width]
    x = _x_grid.astype(np.float32)
    y = _y_grid.astype(np.float32)
else:
    x = np.arange(width, dtype=np.float32)
    y = np.zeros(width, dtype=np.float32)

# Environment params and global vars
env = dict(_input_params)
glob = dict(_input_globals)
generation = env.get('_generation', 0)
dt = env.get('_dt', 1.0)
time = generation * dt

# Shorthand: env_* prefix for each env param (e.g. env_feedRate = env['feedRate'])
for _k, _v in env.items():
    if not _k.startswith('_'):
        globals()['env_' + _k] = _v

# Shorthand: global variables as local variables (e.g. ageLimit, threshold)
for _k, _v in glob.items():
    if not _k.startswith('_'):
        globals()[_k] = _v

# Self proxy: allows self.prop reads and writes in statement-mode expressions
_self_writes = {}
class _SelfProxy:
    def __getattr__(self_proxy, name):
        return cell.get(name, 0)
    def __setattr__(self_proxy, name, value):
        _self_writes[name] = value
        # Also update the local variable and cell dict so subsequent reads see the write
        cell[name] = value
        globals()[name] = value
self = _SelfProxy()

# Override max/min for numpy element-wise compatibility
# Python's builtin max() raises ValueError on numpy arrays with > 1 element
_builtin_max = max
_builtin_min = min
def max(*args):
    if len(args) == 2 and (isinstance(args[0], np.ndarray) or isinstance(args[1], np.ndarray)):
        return np.maximum(args[0], args[1])
    return _builtin_max(*args)
def min(*args):
    if len(args) == 2 and (isinstance(args[0], np.ndarray) or isinstance(args[1], np.ndarray)):
        return np.minimum(args[0], args[1])
    return _builtin_min(*args)

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

def rangeMap(src, src_range, dst_range, easing="linear"):
    src_lo, src_hi = src_range
    dst_lo, dst_hi = dst_range
    t = np.clip((src - src_lo) / (src_hi - src_lo + 1e-10), 0.0, 1.0)
    if easing == "smoothstep":
        t = t * t * (3.0 - 2.0 * t)
    elif easing == "easeIn":
        t = t * t
    elif easing == "easeOut":
        t = 1.0 - (1.0 - t) * (1.0 - t)
    elif easing == "easeInOut":
        t = np.where(t < 0.5, 2.0 * t * t, 1.0 - (-2.0 * t + 2.0) ** 2 / 2.0)
    return dst_lo + t * (dst_hi - dst_lo)

# Output starts as copy of input
_output_buffers = {}
for name in cell:
    _output_buffers[name] = cell[name].astype(np.float32).ravel()

# --- Evaluate expressions ---
${exprBlocks}
`;
}
