/**
 * Node graph engine — barrel exports.
 */

export type {
  PortType,
  PortDirection,
  PortDefinition,
  NodeCategory,
  NodeTypeDefinition,
  NodeInstance,
  Edge,
  NodeGraph,
  CompilationResult,
} from './types';

export { nodeTypeRegistry } from './NodeTypeRegistry';
export { compileNodeGraph, topologicalSort } from './NodeCompiler';
export { decompileCode, hasNodeGraphComment, stripNodeGraphComment } from './NodeDecompiler';
export { registerBuiltinNodes } from './builtinNodes';
