// ---------------------------------------------------------------------------
// Deterministic arithmetic evaluator for the `calculator` tool.
//
// Implemented as a hand-written recursive-descent parser rather than `eval` or
// `new Function`, so the tool is safe to expose to the model without widening
// the code-execution surface. Supports + - * / % ^, parentheses, unary minus
// and a small set of math functions/constants.
// ---------------------------------------------------------------------------

export interface CalculatorResult {
  value: number;
  formatted: string;
  expression: string;
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers, including 1.5 and .5 and 1e-3.
    if (/[0-9.]/.test(ch)) {
      let raw = "";
      while (i < input.length && /[0-9.]/.test(input[i])) raw += input[i++];
      if (input[i] === "e" || input[i] === "E") {
        let exp = input[i++];
        if (input[i] === "+" || input[i] === "-") exp += input[i++];
        while (i < input.length && /[0-9]/.test(input[i])) exp += input[i++];
        raw += exp;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ kind: "num", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let name = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) name += input[i++];
      tokens.push({ kind: "ident", value: name.toLowerCase() });
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "×") {
      tokens.push({ kind: "op", value: "*" });
      i++;
      continue;
    }
    if (ch === "÷") {
      tokens.push({ kind: "op", value: "/" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character "${ch}" in expression`);
  }

  return tokens;
}

/** Recursive-descent parser over the token list. */
function parse(tokens: Token[]): number {
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    // Addition / subtraction (left-associative).
    while (peek()?.kind === "op" && ["+", "-"].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (
      peek()?.kind === "op" &&
      ["*", "/", "%"].includes((peek() as { value: string }).value)
    ) {
      const op = (eat() as { value: string }).value;
      const right = parseUnary();
      if (op === "*") left = left * right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left = left / right;
      } else {
        if (right === 0) throw new Error("Modulo by zero");
        left = left % right;
      }
    }
    return left;
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
      eat();
      const value = parseUnary();
      return token.value === "-" ? -value : value;
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      eat();
      // Right-associative: 2^3^2 === 2^(3^2).
      const exponent = parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary(): number {
    const token = eat();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.kind === "num") return token.value;

    if (token.kind === "lparen") {
      const value = parseExpression();
      const closing = eat();
      if (closing?.kind !== "rparen") throw new Error("Missing closing parenthesis");
      return value;
    }

    if (token.kind === "ident") {
      const name = token.value;

      if (name in CONSTANTS) return CONSTANTS[name];

      const fn = FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown name "${name}"`);

      const opening = eat();
      if (opening?.kind !== "lparen") {
        throw new Error(`Expected "(" after ${name}`);
      }
      const args: number[] = [parseExpression()];
      while (peek()?.kind === "comma") {
        eat();
        args.push(parseExpression());
      }
      const closing = eat();
      if (closing?.kind !== "rparen") throw new Error(`Missing ")" after ${name}(`);
      return fn(...args);
    }

    throw new Error("Unexpected token in expression");
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error("Unexpected trailing input");
  return result;
}

/**
 * Evaluate an arithmetic expression. Throws on malformed input — callers in the
 * tool layer turn that into a structured error outcome.
 */
export function evaluate(expression: string, precision = 6): CalculatorResult {
  const source = expression.trim();
  if (!source) throw new Error("`expression` must not be empty");
  if (source.length > 500) throw new Error("Expression is too long (max 500 characters)");

  const tokens = tokenize(source);
  if (tokens.length === 0) throw new Error("`expression` must not be empty");

  const value = parse(tokens);
  if (!Number.isFinite(value)) throw new Error("Expression did not evaluate to a finite number");

  const digits = Math.min(Math.max(Math.trunc(precision), 0), 12);
  const rounded = Number.parseFloat(value.toFixed(digits));

  return {
    value: rounded,
    formatted: rounded.toLocaleString("en-US", { maximumFractionDigits: digits }),
    expression: source,
  };
}
