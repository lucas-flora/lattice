/**
 * Tokenizer for the transpilable Python subset.
 *
 * Handles significant whitespace (INDENT/DEDENT), Python keywords,
 * operators, literals, and identifiers. Tabs rejected — spaces only.
 */

export type TokenType =
  | 'NUMBER' | 'IDENTIFIER' | 'BOOL'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT' | 'DOUBLESTAR'
  | 'GT' | 'LT' | 'EQ' | 'NEQ' | 'GTE' | 'LTE'
  | 'AND' | 'OR' | 'NOT'
  | 'IF' | 'ELIF' | 'ELSE'
  | 'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET'
  | 'DOT' | 'COMMA' | 'COLON' | 'ASSIGN'
  | 'NEWLINE' | 'INDENT' | 'DEDENT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS: Record<string, TokenType> = {
  'and': 'AND',
  'or': 'OR',
  'not': 'NOT',
  'if': 'IF',
  'elif': 'ELIF',
  'else': 'ELSE',
  'True': 'BOOL',
  'False': 'BOOL',
};

/** Unsupported keywords — rejected with helpful messages */
const UNSUPPORTED_KEYWORDS: Record<string, string> = {
  'import': 'imports are not supported; built-in math functions are available directly (abs, sqrt, sin, cos, etc.)',
  'from': 'imports are not supported; built-in math functions are available directly',
  'for': 'for loops are not supported; simulation rules are applied per-cell automatically',
  'while': 'while loops are not supported',
  'def': 'function definitions are not supported; write your rule logic directly',
  'class': 'classes are not supported',
  'return': 'return statements are not supported; assign to cell properties directly (e.g., alive = 1)',
  'try': 'try/except is not supported',
  'except': 'try/except is not supported',
  'finally': 'try/finally is not supported',
  'with': 'with statements are not supported',
  'yield': 'generators are not supported',
  'lambda': 'lambda expressions are not supported; use inline expressions instead',
  'print': 'print is not supported; use the terminal for output',
  'pass': 'pass is not needed; empty blocks are not supported',
  'break': 'break is not supported; loops are not available',
  'continue': 'continue is not supported; loops are not available',
  'del': 'del is not supported',
  'global': 'global keyword is not supported; use glob.varName for global variables',
  'assert': 'assert is not supported',
  'raise': 'raise is not supported',
  'in': '"in" operator is not supported',
  'is': '"is" operator is not supported; use == for comparison',
};

export class TokenizerError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public suggestion?: string,
  ) {
    super(`Line ${line}, col ${column}: ${message}`);
    this.name = 'TokenizerError';
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  const indentStack: number[] = [0]; // track indent levels

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Check for tabs
    if (rawLine.includes('\t')) {
      throw new TokenizerError('Tabs are not supported; use spaces for indentation', lineNum, rawLine.indexOf('\t') + 1);
    }

    // Skip blank lines and comment-only lines
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Measure indentation (leading spaces)
    const indent = rawLine.length - rawLine.trimStart().length;
    const currentIndent = indentStack[indentStack.length - 1];

    if (indent > currentIndent) {
      indentStack.push(indent);
      tokens.push({ type: 'INDENT', value: '', line: lineNum, column: 1 });
    } else if (indent < currentIndent) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        tokens.push({ type: 'DEDENT', value: '', line: lineNum, column: 1 });
      }
      if (indentStack[indentStack.length - 1] !== indent) {
        throw new TokenizerError('Inconsistent indentation', lineNum, indent + 1);
      }
    }

    // Tokenize the line content
    let col = indent;
    while (col < rawLine.length) {
      const ch = rawLine[col];

      // Skip spaces (within line)
      if (ch === ' ') { col++; continue; }

      // Skip inline comments
      if (ch === '#') break;

      const colNum = col + 1; // 1-based

      // Numbers (int or float)
      if (ch >= '0' && ch <= '9') {
        let num = '';
        while (col < rawLine.length && (rawLine[col] >= '0' && rawLine[col] <= '9' || rawLine[col] === '.')) {
          num += rawLine[col];
          col++;
        }
        tokens.push({ type: 'NUMBER', value: num, line: lineNum, column: colNum });
        continue;
      }

      // Identifiers and keywords
      if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch === '_') {
        let id = '';
        while (col < rawLine.length && (rawLine[col] >= 'a' && rawLine[col] <= 'z' || rawLine[col] >= 'A' && rawLine[col] <= 'Z' || rawLine[col] >= '0' && rawLine[col] <= '9' || rawLine[col] === '_')) {
          id += rawLine[col];
          col++;
        }

        // Check for unsupported keywords
        if (UNSUPPORTED_KEYWORDS[id]) {
          throw new TokenizerError(UNSUPPORTED_KEYWORDS[id], lineNum, colNum, UNSUPPORTED_KEYWORDS[id]);
        }

        // Check for supported keywords
        if (KEYWORDS[id]) {
          tokens.push({ type: KEYWORDS[id], value: id, line: lineNum, column: colNum });
        } else {
          tokens.push({ type: 'IDENTIFIER', value: id, line: lineNum, column: colNum });
        }
        continue;
      }

      // String literals — reject with message
      if (ch === '"' || ch === "'") {
        throw new TokenizerError('String literals are not supported; use numeric values and cell properties', lineNum, colNum);
      }

      // Two-character operators
      if (col + 1 < rawLine.length) {
        const two = rawLine.slice(col, col + 2);
        if (two === '**') { tokens.push({ type: 'DOUBLESTAR', value: '**', line: lineNum, column: colNum }); col += 2; continue; }
        if (two === '==') { tokens.push({ type: 'EQ', value: '==', line: lineNum, column: colNum }); col += 2; continue; }
        if (two === '!=') { tokens.push({ type: 'NEQ', value: '!=', line: lineNum, column: colNum }); col += 2; continue; }
        if (two === '>=') { tokens.push({ type: 'GTE', value: '>=', line: lineNum, column: colNum }); col += 2; continue; }
        if (two === '<=') { tokens.push({ type: 'LTE', value: '<=', line: lineNum, column: colNum }); col += 2; continue; }
      }

      // Single-character operators and punctuation
      switch (ch) {
        case '+': tokens.push({ type: 'PLUS', value: '+', line: lineNum, column: colNum }); col++; continue;
        case '-': tokens.push({ type: 'MINUS', value: '-', line: lineNum, column: colNum }); col++; continue;
        case '*': tokens.push({ type: 'STAR', value: '*', line: lineNum, column: colNum }); col++; continue;
        case '/': tokens.push({ type: 'SLASH', value: '/', line: lineNum, column: colNum }); col++; continue;
        case '%': tokens.push({ type: 'PERCENT', value: '%', line: lineNum, column: colNum }); col++; continue;
        case '>': tokens.push({ type: 'GT', value: '>', line: lineNum, column: colNum }); col++; continue;
        case '<': tokens.push({ type: 'LT', value: '<', line: lineNum, column: colNum }); col++; continue;
        case '(': tokens.push({ type: 'LPAREN', value: '(', line: lineNum, column: colNum }); col++; continue;
        case ')': tokens.push({ type: 'RPAREN', value: ')', line: lineNum, column: colNum }); col++; continue;
        case '[': tokens.push({ type: 'LBRACKET', value: '[', line: lineNum, column: colNum }); col++; continue;
        case ']': tokens.push({ type: 'RBRACKET', value: ']', line: lineNum, column: colNum }); col++; continue;
        case '.': tokens.push({ type: 'DOT', value: '.', line: lineNum, column: colNum }); col++; continue;
        case ',': tokens.push({ type: 'COMMA', value: ',', line: lineNum, column: colNum }); col++; continue;
        case ':': tokens.push({ type: 'COLON', value: ':', line: lineNum, column: colNum }); col++; continue;
        case '=': tokens.push({ type: 'ASSIGN', value: '=', line: lineNum, column: colNum }); col++; continue;
      }

      throw new TokenizerError(`Unexpected character: '${ch}'`, lineNum, colNum);
    }

    // End of line
    tokens.push({ type: 'NEWLINE', value: '', line: lineNum, column: rawLine.length + 1 });
  }

  // Emit remaining DEDENTs
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ type: 'DEDENT', value: '', line: lines.length, column: 1 });
  }

  tokens.push({ type: 'EOF', value: '', line: lines.length + 1, column: 1 });
  return tokens;
}
