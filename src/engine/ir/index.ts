/**
 * IR subsystem — public API.
 *
 * The Intermediate Representation is the compilation hub:
 *   NodeGraph → IR → WGSL (GPU) / Python (preview)
 */

export type {
  IRType, IRBuiltinFn, IRNode, IRStatement,
  IRProgram, IRPropertyDescriptor,
} from './types';
export { IR } from './IRBuilder';
export { validateIR, type ValidationResult, type ValidationError, type ValidationWarning } from './validate';
export { generateWGSL, type WGSLCodegenConfig } from './WGSLCodegen';
export { generatePython } from './PythonCodegen';
