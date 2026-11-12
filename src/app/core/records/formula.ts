/**
 * Client-side preview of calculated fields. Mirrors the backend's tiny, safe
 * arithmetic grammar (numbers, field keys, `+ - * / ( )`, unary minus); nothing
 * is ever `eval`-ed. The server stays the source of truth: it recomputes every
 * calculated value on save.
 */

type Token =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'ref'; readonly name: string }
  | { readonly kind: 'op'; readonly op: string };

export class FormulaError extends Error {}

const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([a-z][a-z0-9_]*)|([-+*/()]))/y;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let index = 0;
  while (index < source.length) {
    if (/^\s*$/.test(source.slice(index))) {
      break;
    }
    TOKEN_RE.lastIndex = index;
    const match = TOKEN_RE.exec(source);
    if (!match) {
      throw new FormulaError(`Unexpected character at ${index}`);
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'num', value: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: 'ref', name: match[2] });
    } else {
      tokens.push({ kind: 'op', op: match[3] });
    }
    index = TOKEN_RE.lastIndex;
  }
  return tokens;
}

/** A parsed formula node. */
export type FormulaNode =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'ref'; readonly name: string }
  | { readonly kind: 'neg'; readonly arg: FormulaNode }
  | {
      readonly kind: 'bin';
      readonly op: '+' | '-' | '*' | '/';
      readonly left: FormulaNode;
      readonly right: FormulaNode;
    };

/** Parse a formula; throws {@link FormulaError} on any syntax problem. */
export function parseFormula(source: string): FormulaNode {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isOp = (op: string): boolean => {
    const token = peek();
    return token?.kind === 'op' && token.op === op;
  };

  const primary = (): FormulaNode => {
    const token = peek();
    if (!token) {
      throw new FormulaError('Unexpected end of formula');
    }
    if (token.kind === 'op' && token.op === '-') {
      pos++;
      return { kind: 'neg', arg: primary() };
    }
    if (token.kind === 'op' && token.op === '(') {
      pos++;
      const inner = expression();
      if (!isOp(')')) {
        throw new FormulaError('Missing closing parenthesis');
      }
      pos++;
      return inner;
    }
    pos++;
    if (token.kind === 'num') {
      return { kind: 'num', value: token.value };
    }
    if (token.kind === 'ref') {
      return { kind: 'ref', name: token.name };
    }
    throw new FormulaError(`Unexpected ${token.op}`);
  };

  const term = (): FormulaNode => {
    let left = primary();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { op: '*' | '/' }).op;
      left = { kind: 'bin', op, left, right: primary() };
    }
    return left;
  };

  const expression = (): FormulaNode => {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { op: '+' | '-' }).op;
      left = { kind: 'bin', op, left, right: term() };
    }
    return left;
  };

  if (tokens.length === 0) {
    throw new FormulaError('Empty formula');
  }
  const node = expression();
  if (pos !== tokens.length) {
    throw new FormulaError('Unexpected input after the formula');
  }
  return node;
}

/** Field keys a formula uses. */
export function formulaRefs(node: FormulaNode): string[] {
  switch (node.kind) {
    case 'num':
      return [];
    case 'ref':
      return [node.name];
    case 'neg':
      return formulaRefs(node.arg);
    case 'bin':
      return [...new Set([...formulaRefs(node.left), ...formulaRefs(node.right)])];
  }
}

/**
 * Evaluate a formula against record data. Null when a referenced value is
 * missing or not a number, on division by zero, or on any syntax problem.
 */
export function evaluateFormula(
  source: string,
  data: Readonly<Record<string, unknown>>,
): number | null {
  let node: FormulaNode;
  try {
    node = parseFormula(source);
  } catch {
    return null;
  }
  const run = (n: FormulaNode): number | null => {
    switch (n.kind) {
      case 'num':
        return n.value;
      case 'ref': {
        const value = data[n.name];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      }
      case 'neg': {
        const value = run(n.arg);
        return value === null ? null : -value;
      }
      case 'bin': {
        const left = run(n.left);
        const right = run(n.right);
        if (left === null || right === null) {
          return null;
        }
        switch (n.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            return right === 0 ? null : left / right;
        }
      }
    }
  };
  const result = run(node);
  return result !== null && Number.isFinite(result) ? result : null;
}
