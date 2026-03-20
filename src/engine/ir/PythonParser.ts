/**
 * Python-to-IR parser for the transpilable Python subset.
 *
 * Recursive descent parser that takes tokenized Python and produces an IRProgram.
 * Resolution order for identifiers:
 *   1. Local variables (previously assigned)
 *   2. Cell properties
 *   3. Neighbor magic variables (neighbor_sum_X, neighbors_X)
 *   4. Grid params (x, y, z, width, height, generation, dt)
 *   5. Env params
 *   6. Global vars
 *   7. Built-in functions (handled in parseCall)
 */

import { tokenize, type Token, type TokenType, TokenizerError } from './pythonTokenizer';
import { IR } from './IRBuilder';
import type { IRNode, IRStatement, IRProgram, IRPropertyDescriptor, IRType } from './types';

export interface PythonParseContext {
  cellProperties: { name: string; type: IRType; channels: number }[];
  envParams: string[];
  globalVars: string[];
  neighborhoodType: 'moore' | 'von_neumann';
}

export interface ParseWarning {
  message: string;
  line: number;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public suggestion?: string,
  ) {
    super(`Line ${line}, col ${column}: ${message}`);
    this.name = 'ParseError';
  }
}

interface PythonParseResult {
  program: IRProgram;
  warnings: ParseWarning[];
}

const GRID_PARAMS = new Set(['width', 'height', 'depth', 'generation', 'dt']);
const COORDINATES = new Set(['x', 'y', 'z']);
const BUILTIN_FNS = new Set([
  'abs', 'sqrt', 'sin', 'cos', 'floor', 'ceil',
  'min', 'max', 'clamp', 'smoothstep', 'pow',
  'fract', 'sign', 'step', 'mix',
  'int', 'float',
]);

export function parsePython(source: string, context: PythonParseContext): PythonParseResult {
  const tokens = tokenize(source);
  const cellPropNames = new Set(context.cellProperties.map(p => p.name));
  const envParamNames = new Set(context.envParams);
  const globalVarNames = new Set(context.globalVars);
  const declaredLocals = new Set<string>();
  const readProps = new Map<string, IRPropertyDescriptor>();
  const writtenProps = new Map<string, IRPropertyDescriptor>();
  let neighborhoodAccess = false;
  const warnings: ParseWarning[] = [];

  let pos = 0;

  // ── Token helpers ──

  function peek(): Token { return tokens[pos] ?? tokens[tokens.length - 1]; }
  function advance(): Token { return tokens[pos++]; }
  function check(type: TokenType): boolean { return peek().type === type; }

  function expect(type: TokenType): Token {
    const tok = peek();
    if (tok.type !== type) {
      throw new ParseError(`Expected ${type}, got ${tok.type} ('${tok.value}')`, tok.line, tok.column);
    }
    return advance();
  }

  function match(type: TokenType): boolean {
    if (check(type)) { advance(); return true; }
    return false;
  }

  function skipNewlines(): void {
    while (check('NEWLINE')) advance();
  }

  // ── Resolve identifier to IR node ──

  function resolveIdentifier(name: string, tok: Token): IRNode {
    // 1. Local variable
    if (declaredLocals.has(name)) {
      return IR.varRef(name);
    }

    // 2. Cell property
    if (cellPropNames.has(name)) {
      trackInput(name, 'cell');
      return IR.readCell(name);
    }

    // 3. Neighbor magic variables
    if (name.startsWith('neighbor_sum_')) {
      const prop = name.slice('neighbor_sum_'.length);
      neighborhoodAccess = true;
      trackInput(prop, 'cell');
      return IR.neighborSum(prop);
    }
    if (name.startsWith('neighbors_')) {
      const prop = name.slice('neighbors_'.length);
      neighborhoodAccess = true;
      trackInput(prop, 'cell');
      return IR.neighborSum(prop);
    }

    // 4. Grid params
    if (COORDINATES.has(name)) {
      return { kind: 'coordinates', axis: name as 'x' | 'y' | 'z', type: 'u32' };
    }
    if (GRID_PARAMS.has(name)) {
      const param = name as 'width' | 'height' | 'depth' | 'generation' | 'dt';
      return { kind: 'grid_param', param, type: param === 'dt' ? 'f32' : 'u32' };
    }
    // 'time' alias for generation
    if (name === 'time') {
      return { kind: 'grid_param', param: 'generation', type: 'u32' };
    }

    // 5. Env params
    if (envParamNames.has(name)) {
      trackInput(name, 'env');
      return IR.readEnv(name);
    }

    // 5b. Env params with underscore convention: env_feedRate → env.feedRate
    if (name.startsWith('env_')) {
      const envName = name.slice(4);
      if (envParamNames.has(envName)) {
        trackInput(envName, 'env');
        return IR.readEnv(envName);
      }
    }

    // 6. Global vars
    if (globalVarNames.has(name)) {
      trackInput(name, 'global');
      return IR.readGlobal(name);
    }

    throw new ParseError(
      `Unknown identifier '${name}'`,
      tok.line, tok.column,
      `Available: ${[...cellPropNames, ...envParamNames, ...globalVarNames].join(', ')}`,
    );
  }

  function trackInput(property: string, scope: 'cell' | 'env' | 'global'): void {
    const key = `${scope}.${property}`;
    if (!readProps.has(key)) {
      readProps.set(key, { property, scope, type: 'f32' });
    }
  }

  function trackOutput(property: string): void {
    const key = `cell.${property}`;
    if (!writtenProps.has(key)) {
      writtenProps.set(key, { property, scope: 'cell', type: 'f32' });
    }
  }

  // ── Expression parsing (precedence climbing) ──

  function parseExpression(): IRNode {
    return parseTernary();
  }

  function parseTernary(): IRNode {
    let expr = parseOr();
    // Python ternary: value_if_true if condition else value_if_false
    if (check('IF')) {
      advance();
      const condition = parseOr();
      expect('ELSE');
      const ifFalse = parseTernary();
      expr = IR.select(condition, expr, ifFalse);
    }
    return expr;
  }

  function parseOr(): IRNode {
    let left = parseAnd();
    while (match('OR')) {
      const right = parseAnd();
      left = IR.or(left, right);
    }
    return left;
  }

  function parseAnd(): IRNode {
    let left = parseNot();
    while (match('AND')) {
      const right = parseNot();
      left = IR.and(left, right);
    }
    return left;
  }

  function parseNot(): IRNode {
    if (match('NOT')) {
      const operand = parseNot();
      return IR.not(operand);
    }
    return parseComparison();
  }

  function parseComparison(): IRNode {
    let left = parseAdd();
    while (check('GT') || check('LT') || check('EQ') || check('NEQ') || check('GTE') || check('LTE')) {
      const opTok = advance();
      const right = parseAdd();
      const op = opTok.value as '>' | '<' | '==' | '!=' | '>=' | '<=';
      left = { kind: 'compare', op, left, right, type: 'bool' as IRType };
    }
    return left;
  }

  function parseAdd(): IRNode {
    let left = parseMul();
    while (check('PLUS') || check('MINUS')) {
      const opTok = advance();
      const right = parseMul();
      if (opTok.type === 'PLUS') left = IR.add(left, right);
      else left = IR.sub(left, right);
    }
    return left;
  }

  function parseMul(): IRNode {
    let left = parseUnary();
    while (check('STAR') || check('SLASH') || check('PERCENT')) {
      const opTok = advance();
      const right = parseUnary();
      if (opTok.type === 'STAR') left = IR.mul(left, right);
      else if (opTok.type === 'SLASH') left = IR.div(left, right);
      else left = IR.mod(left, right);
    }
    return left;
  }

  function parseUnary(): IRNode {
    if (match('MINUS')) {
      const operand = parseUnary();
      return IR.neg(operand);
    }
    return parsePower();
  }

  function parsePower(): IRNode {
    let base = parseCall();
    if (match('DOUBLESTAR')) {
      const exp = parseUnary(); // right-associative
      base = IR.pow(base, exp);
    }
    return base;
  }

  function parseCall(): IRNode {
    const primary = parsePrimary();

    // Function call: identifier followed by (args)
    // parsePrimary already handled calls for known identifiers
    return primary;
  }

  function parsePrimary(): IRNode {
    const tok = peek();

    // Number literal
    if (tok.type === 'NUMBER') {
      advance();
      const val = parseFloat(tok.value);
      return tok.value.includes('.') ? IR.f32(val) : IR.f32(val);
    }

    // Boolean literal
    if (tok.type === 'BOOL') {
      advance();
      return IR.bool(tok.value === 'True');
    }

    // Parenthesized expression
    if (tok.type === 'LPAREN') {
      advance();
      const expr = parseExpression();
      expect('RPAREN');
      return expr;
    }

    // Identifier (variable, property, function call)
    if (tok.type === 'IDENTIFIER') {
      advance();
      const name = tok.value;

      // Function call: name(args)
      if (check('LPAREN') && BUILTIN_FNS.has(name)) {
        advance(); // consume '('
        const args: IRNode[] = [];
        if (!check('RPAREN')) {
          args.push(parseExpression());
          while (match('COMMA')) {
            args.push(parseExpression());
          }
        }
        expect('RPAREN');
        return emitBuiltinCall(name, args, tok);
      }

      // Property access: self.prop, cell['prop'], env.param, glob.var, np.where/np.X
      if (check('DOT')) {
        advance();
        const propTok = expect('IDENTIFIER');

        // np.where(cond, ifTrue, ifFalse) → select
        // np.abs, np.sqrt etc. → built-in function
        if (name === 'np') {
          const npFn = propTok.value;
          if (check('LPAREN')) {
            advance();
            const args: IRNode[] = [];
            if (!check('RPAREN')) {
              args.push(parseExpression());
              while (match('COMMA')) args.push(parseExpression());
            }
            expect('RPAREN');
            if (npFn === 'where') {
              if (args.length !== 3) throw new ParseError(`np.where() takes 3 arguments`, tok.line, tok.column);
              return IR.select(args[0], args[1], args[2]);
            }
            return emitBuiltinCall(npFn, args, tok);
          }
          throw new ParseError(`np.${npFn} must be called as a function`, tok.line, tok.column);
        }

        if (name === 'self' || name === 'cell') {
          trackInput(propTok.value, 'cell');
          return IR.readCell(propTok.value);
        }
        if (name === 'env') {
          trackInput(propTok.value, 'env');
          return IR.readEnv(propTok.value);
        }
        if (name === 'glob') {
          trackInput(propTok.value, 'global');
          return IR.readGlobal(propTok.value);
        }
        throw new ParseError(`Unknown object '${name}'`, tok.line, tok.column);
      }

      // Bracket access: cell['prop'], env['param']
      if (check('LBRACKET')) {
        advance();
        const keyTok = peek();
        // We expect a string-like identifier inside brackets
        // Since we don't support string literals, accept an identifier
        // For cell['alive'], the tokenizer would reject the string.
        // Accept bare identifiers: cell[alive]
        if (keyTok.type === 'IDENTIFIER') {
          advance();
          expect('RBRACKET');
          if (name === 'cell' || name === 'self') {
            trackInput(keyTok.value, 'cell');
            return IR.readCell(keyTok.value);
          }
          if (name === 'env') {
            trackInput(keyTok.value, 'env');
            return IR.readEnv(keyTok.value);
          }
          if (name === 'glob') {
            trackInput(keyTok.value, 'global');
            return IR.readGlobal(keyTok.value);
          }
        }
        throw new ParseError(`Bracket access only supported on cell, env, or glob`, tok.line, tok.column);
      }

      // Regular identifier resolution
      return resolveIdentifier(name, tok);
    }

    throw new ParseError(`Unexpected token: ${tok.type} ('${tok.value}')`, tok.line, tok.column);
  }

  function emitBuiltinCall(name: string, args: IRNode[], tok: Token): IRNode {
    // Type casts
    if (name === 'int') {
      if (args.length !== 1) throw new ParseError(`int() takes exactly 1 argument`, tok.line, tok.column);
      return IR.toU32(args[0]);
    }
    if (name === 'float') {
      if (args.length !== 1) throw new ParseError(`float() takes exactly 1 argument`, tok.line, tok.column);
      return IR.toF32(args[0]);
    }

    // Math functions
    const fnMap: Record<string, string> = {
      'abs': 'abs', 'sqrt': 'sqrt', 'sin': 'sin', 'cos': 'cos',
      'floor': 'floor', 'ceil': 'ceil', 'min': 'min', 'max': 'max',
      'clamp': 'clamp', 'smoothstep': 'smoothstep', 'pow': 'pow',
      'fract': 'fract', 'sign': 'sign', 'step': 'step', 'mix': 'mix',
    };
    const irFn = fnMap[name];
    if (irFn) {
      return IR.call(irFn as Parameters<typeof IR.call>[0], ...args);
    }

    throw new ParseError(`Unknown function '${name}'`, tok.line, tok.column);
  }

  // ── Statement parsing ──

  function parseStatement(): IRStatement | IRStatement[] {
    skipNewlines();
    if (check('EOF')) throw new ParseError('Unexpected end of input', peek().line, peek().column);

    // If statement
    if (check('IF')) return parseIfStatement();

    // Assignment: target = expression
    return parseAssignment();
  }

  function parseAssignment(): IRStatement {
    const tok = peek();

    // self.prop = expr
    if (tok.type === 'IDENTIFIER' && tok.value === 'self' && tokens[pos + 1]?.type === 'DOT') {
      advance(); // 'self'
      advance(); // '.'
      const propTok = expect('IDENTIFIER');
      expect('ASSIGN');
      const value = parseExpression();
      trackOutput(propTok.value);
      return IR.writeProperty(propTok.value, value);
    }

    // Regular assignment: name = expr
    if (tok.type === 'IDENTIFIER') {
      const name = tok.value;

      // Check if next token is '=' (assignment) vs other operator
      if (tokens[pos + 1]?.type === 'ASSIGN') {
        advance(); // identifier
        advance(); // '='
        const value = parseExpression();

        // Determine: property write or local variable
        if (cellPropNames.has(name)) {
          trackOutput(name);
          if (!declaredLocals.has(name)) {
            return IR.writeProperty(name, value);
          }
          // If also a local, ambiguity — treat as property write
          return IR.writeProperty(name, value);
        }

        // Local variable
        if (declaredLocals.has(name)) {
          return IR.assignVar(name, value);
        }
        declaredLocals.add(name);
        return IR.declareVar(name, 'f32', value);
      }

      // Also handle cell['prop'] = expr and env['param'] = expr
      if (tokens[pos + 1]?.type === 'LBRACKET') {
        advance(); // identifier (cell/self)
        advance(); // '['
        const keyTok = expect('IDENTIFIER');
        expect('RBRACKET');
        expect('ASSIGN');
        const value = parseExpression();

        if (name === 'cell' || name === 'self') {
          trackOutput(keyTok.value);
          return IR.writeProperty(keyTok.value, value);
        }
        throw new ParseError(`Cannot assign to ${name}['${keyTok.value}'] — only cell properties are writable`, tok.line, tok.column);
      }

      // Also handle self.prop with dot assignment checked above
    }

    // Expression statement (not an assignment — error)
    throw new ParseError(
      `Expected assignment (e.g., 'alive = ...') but got '${tok.value}'`,
      tok.line, tok.column,
    );
  }

  function parseIfStatement(): IRStatement {
    expect('IF');
    const condition = parseExpression();
    expect('COLON');
    skipNewlines();
    expect('INDENT');

    const body: IRStatement[] = [];
    while (!check('DEDENT') && !check('EOF')) {
      const stmt = parseStatement();
      if (Array.isArray(stmt)) body.push(...stmt);
      else body.push(stmt);
      skipNewlines();
    }
    if (check('DEDENT')) advance();

    // elif/else
    skipNewlines();
    let elseBody: IRStatement[] | undefined;
    if (check('ELIF')) {
      // elif → nested if in the else branch
      const elifStmt = parseElifStatement();
      elseBody = [elifStmt];
    } else if (check('ELSE')) {
      advance();
      expect('COLON');
      skipNewlines();
      expect('INDENT');
      elseBody = [];
      while (!check('DEDENT') && !check('EOF')) {
        const stmt = parseStatement();
        if (Array.isArray(stmt)) elseBody.push(...stmt);
        else elseBody.push(stmt);
        skipNewlines();
      }
      if (check('DEDENT')) advance();
    }

    return IR.ifStmt(condition, body, elseBody);
  }

  function parseElifStatement(): IRStatement {
    expect('ELIF');
    const condition = parseExpression();
    expect('COLON');
    skipNewlines();
    expect('INDENT');

    const body: IRStatement[] = [];
    while (!check('DEDENT') && !check('EOF')) {
      const stmt = parseStatement();
      if (Array.isArray(stmt)) body.push(...stmt);
      else body.push(stmt);
      skipNewlines();
    }
    if (check('DEDENT')) advance();

    skipNewlines();
    let elseBody: IRStatement[] | undefined;
    if (check('ELIF')) {
      elseBody = [parseElifStatement()];
    } else if (check('ELSE')) {
      advance();
      expect('COLON');
      skipNewlines();
      expect('INDENT');
      elseBody = [];
      while (!check('DEDENT') && !check('EOF')) {
        const stmt = parseStatement();
        if (Array.isArray(stmt)) elseBody.push(...stmt);
        else elseBody.push(stmt);
        skipNewlines();
      }
      if (check('DEDENT')) advance();
    }

    return IR.ifStmt(condition, body, elseBody);
  }

  // ── Program parsing ──

  function parseProgram(): IRStatement[] {
    const statements: IRStatement[] = [];
    skipNewlines();
    while (!check('EOF')) {
      const stmt = parseStatement();
      if (Array.isArray(stmt)) statements.push(...stmt);
      else statements.push(stmt);
      skipNewlines();
    }
    return statements;
  }

  // ── Execute ──

  const statements = parseProgram();

  const inputs = [...readProps.values()];
  const outputs = [...writtenProps.values()];

  // Also add written properties to inputs if they're read before being written
  // (handled naturally since resolveIdentifier tracks reads)

  const program: IRProgram = {
    statements,
    inputs,
    outputs,
    neighborhoodAccess,
    metadata: { sourceType: 'python_script' },
  };

  return { program, warnings };
}
