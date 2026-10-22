import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/tools/calculator";

// The calculator is deliberately a hand-written parser rather than `eval`, so
// these tests double as the contract for what the model is allowed to compute.

describe("evaluate - arithmetic", () => {
  it("adds", () => {
    expect(evaluate("1+2").value).toBe(3);
  });

  it("respects operator precedence", () => {
    expect(evaluate("2+3*4").value).toBe(14);
  });

  it("honours parentheses", () => {
    expect(evaluate("(2+3)*4").value).toBe(20);
  });

  it("applies unary minus", () => {
    expect(evaluate("-5+2").value).toBe(-3);
  });

  it("handles nested unary operators", () => {
    expect(evaluate("--4").value).toBe(4);
  });

  it("treats ^ as right-associative", () => {
    // 2^(3^2) === 512, not (2^3)^2 === 64.
    expect(evaluate("2^3^2").value).toBe(512);
  });

  it("computes modulo", () => {
    expect(evaluate("10 % 3").value).toBe(1);
  });

  it("accepts the unicode multiplication and division signs", () => {
    expect(evaluate("6 \u00d7 7").value).toBe(42);
    expect(evaluate("84 \u00f7 2").value).toBe(42);
  });

  it("parses decimals and scientific notation", () => {
    expect(evaluate(".5 + .25").value).toBe(0.75);
    expect(evaluate("1e3").value).toBe(1000);
  });
});

describe("evaluate - functions and constants", () => {
  it("evaluates sqrt", () => {
    expect(evaluate("sqrt(16)").value).toBe(4);
  });

  it("evaluates a variadic min/max", () => {
    expect(evaluate("max(1,5,3)").value).toBe(5);
    expect(evaluate("min(1,5,3)").value).toBe(1);
  });

  it("exposes pi, e and tau", () => {
    expect(evaluate("pi", 6).value).toBeCloseTo(3.141593, 5);
    expect(evaluate("e", 6).value).toBeCloseTo(2.718282, 5);
    expect(evaluate("tau", 6).value).toBeCloseTo(6.283185, 5);
  });

  it("composes functions with constants", () => {
    expect(evaluate("sqrt(2)*pi", 6).value).toBeCloseTo(4.442883, 5);
  });

  it("is case-insensitive for names", () => {
    expect(evaluate("SQRT(9)").value).toBe(3);
  });
});

describe("evaluate - precision and formatting", () => {
  it("rounds to the requested number of decimals", () => {
    expect(evaluate("10/3", 2).value).toBe(3.33);
    expect(evaluate("10/3", 4).value).toBe(3.3333);
  });

  it("defaults to six decimals", () => {
    expect(evaluate("10/3").value).toBe(3.333333);
  });

  it("groups thousands separators for readability", () => {
    expect(evaluate("1234567").formatted).toBe("1,234,567");
  });

  it("clamps out-of-range precision instead of throwing", () => {
    expect(() => evaluate("1/3", 99)).not.toThrow();
    expect(() => evaluate("1/3", -5)).not.toThrow();
  });

  it("echoes the original expression", () => {
    expect(evaluate("  2 + 2  ").expression).toBe("2 + 2");
  });
});

describe("evaluate - rejects bad input", () => {
  it("throws on an empty expression", () => {
    expect(() => evaluate("   ")).toThrow(/must not be empty/);
  });

  it("throws on division by zero", () => {
    expect(() => evaluate("1/0")).toThrow(/Division by zero/);
  });

  it("throws on modulo by zero", () => {
    expect(() => evaluate("5 % 0")).toThrow(/Modulo by zero/);
  });

  it("throws on an unknown identifier", () => {
    expect(() => evaluate("nope(2)")).toThrow(/Unknown name/);
  });

  it("throws on unbalanced parentheses", () => {
    expect(() => evaluate("(1+2")).toThrow(/closing parenthesis/);
  });

  it("throws on a stray character", () => {
    expect(() => evaluate("1 + @")).toThrow(/Unexpected character/);
  });

  it("refuses an over-long expression rather than grinding on it", () => {
    expect(() => evaluate("1+".repeat(400) + "1")).toThrow(/too long/);
  });

  it("never returns a non-finite number", () => {
    expect(() => evaluate("9^9^9")).toThrow(/finite number/);
  });
});
