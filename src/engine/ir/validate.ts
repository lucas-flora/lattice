/**
 * IR Validator — catches errors before codegen.
 *
 * Validates type consistency, variable scoping, property declarations,
 * argument counts for built-in functions, and structural correctness.
 */

import type { IRProgram, IRNode, IRStatement, IRBuiltinFn } from './types';

export interface ValidationError {
  message: string;
  path?: string;
}

export interface ValidationWarning {
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** Expected argument counts for built-in functions */
const BUILTIN_ARITY: Record<IRBuiltinFn, number> = {
  abs: 1, sqrt: 1, sin: 1, cos: 1, floor: 1, ceil: 1,
  fract: 1, sign: 1,
  min: 2, max: 2, pow: 2, step: 2, mix: 3,
  clamp: 3, smoothstep: 3,
};

export function validateIR(program: IRProgram): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const declaredVars = new Set<string>();
  const referencedVars = new Set<string>();
  const inputProps = new Set(program.inputs.map(i => `${i.scope}.${i.property}`));
  const outputProps = new Set(program.outputs.map(o => `${o.scope}.${o.property}`));

  function validateNode(node: IRNode, path: string): void {
    switch (node.kind) {
      case 'literal':
        break;

      case 'read_property':
        if (node.scope === 'cell' || node.scope === 'env' || node.scope === 'global') {
          const key = `${node.scope}.${node.property}`;
          if (!inputProps.has(key)) {
            errors.push({ message: `Property '${key}' read but not declared in inputs`, path });
          }
        }
        break;

      case 'binop':
        validateNode(node.left, `${path}.left`);
        validateNode(node.right, `${path}.right`);
        if (node.left.type !== node.right.type) {
          errors.push({ message: `Type mismatch in '${node.op}': left=${node.left.type}, right=${node.right.type}`, path });
        }
        break;

      case 'unary':
        validateNode(node.operand, `${path}.operand`);
        if (node.op === '!' && node.operand.type !== 'bool') {
          errors.push({ message: `Logical NOT requires bool operand, got ${node.operand.type}`, path });
        }
        break;

      case 'compare':
        validateNode(node.left, `${path}.left`);
        validateNode(node.right, `${path}.right`);
        if (node.left.type !== node.right.type) {
          errors.push({ message: `Type mismatch in comparison '${node.op}': left=${node.left.type}, right=${node.right.type}`, path });
        }
        break;

      case 'logic':
        validateNode(node.left, `${path}.left`);
        validateNode(node.right, `${path}.right`);
        if (node.left.type !== 'bool') {
          errors.push({ message: `Logic '${node.op}' requires bool operands, left is ${node.left.type}`, path });
        }
        if (node.right.type !== 'bool') {
          errors.push({ message: `Logic '${node.op}' requires bool operands, right is ${node.right.type}`, path });
        }
        break;

      case 'select':
        validateNode(node.condition, `${path}.condition`);
        validateNode(node.ifTrue, `${path}.ifTrue`);
        validateNode(node.ifFalse, `${path}.ifFalse`);
        if (node.condition.type !== 'bool') {
          errors.push({ message: `Select condition must be bool, got ${node.condition.type}`, path });
        }
        if (node.ifTrue.type !== node.ifFalse.type) {
          errors.push({ message: `Select branches have different types: true=${node.ifTrue.type}, false=${node.ifFalse.type}`, path });
        }
        break;

      case 'call': {
        const expected = BUILTIN_ARITY[node.fn];
        if (expected !== undefined && node.args.length !== expected) {
          errors.push({ message: `'${node.fn}' expects ${expected} args, got ${node.args.length}`, path });
        }
        for (let i = 0; i < node.args.length; i++) {
          validateNode(node.args[i], `${path}.args[${i}]`);
        }
        break;
      }

      case 'neighbor_reduce':
        if (!program.neighborhoodAccess) {
          errors.push({ message: `neighbor_reduce used but neighborhoodAccess is false`, path });
        }
        if (node.predicate) {
          validateNode(node.predicate, `${path}.predicate`);
        }
        break;

      case 'neighbor_at':
        if (!program.neighborhoodAccess) {
          errors.push({ message: `neighbor_at used but neighborhoodAccess is false`, path });
        }
        break;

      case 'var_ref':
        referencedVars.add(node.name);
        if (!declaredVars.has(node.name)) {
          errors.push({ message: `Variable '${node.name}' referenced before declaration`, path });
        }
        break;

      case 'cast':
        validateNode(node.value, `${path}.value`);
        break;

      case 'coordinates':
      case 'grid_param':
        break;
    }
  }

  function validateStatement(stmt: IRStatement, path: string): void {
    switch (stmt.kind) {
      case 'declare_var':
        if (declaredVars.has(stmt.name)) {
          errors.push({ message: `Duplicate variable declaration: '${stmt.name}'`, path });
        }
        declaredVars.add(stmt.name);
        validateNode(stmt.value, `${path}.value`);
        break;

      case 'assign_var':
        if (!declaredVars.has(stmt.name)) {
          errors.push({ message: `Assignment to undeclared variable: '${stmt.name}'`, path });
        }
        validateNode(stmt.value, `${path}.value`);
        break;

      case 'write_property': {
        const key = `cell.${stmt.property}`;
        if (!outputProps.has(key)) {
          errors.push({ message: `Property '${key}' written but not declared in outputs`, path });
        }
        validateNode(stmt.value, `${path}.value`);
        break;
      }

      case 'if':
        validateNode(stmt.condition, `${path}.condition`);
        if (stmt.condition.type !== 'bool') {
          errors.push({ message: `If condition must be bool, got ${stmt.condition.type}`, path });
        }
        for (let i = 0; i < stmt.body.length; i++) {
          validateStatement(stmt.body[i], `${path}.body[${i}]`);
        }
        if (stmt.elseBody) {
          for (let i = 0; i < stmt.elseBody.length; i++) {
            validateStatement(stmt.elseBody[i], `${path}.elseBody[${i}]`);
          }
        }
        break;
    }
  }

  for (let i = 0; i < program.statements.length; i++) {
    validateStatement(program.statements[i], `statements[${i}]`);
  }

  // Warn on unused variables
  for (const name of declaredVars) {
    if (!referencedVars.has(name)) {
      warnings.push({ message: `Variable '${name}' declared but never referenced` });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
