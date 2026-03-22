/**
 * Scripting module: global variable store and scripting types.
 *
 * GPU-native: Python rules compile via PythonParser → IR → WGSL.
 * Pyodide/Web Worker infrastructure has been removed.
 */
export { GlobalVariableStore } from './GlobalVariableStore';
export type { GlobalVariableDef, GlobalScriptDef } from './types';
