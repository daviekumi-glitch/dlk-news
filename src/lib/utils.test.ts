import { describe, expect, it } from "vitest";
import {
  cn,
  deriveTitle,
  estimateTokens,
  formatBytes,
  formatClock,
  initials,
  slugify,
  timeBucket,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("lets a later conflict win, which is the point of tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("deriveTitle", () => {
  it("collapses whitespace", () => {
    expect(deriveTitle("  hello   world  ")).toBe("hello world");
  });

  it("falls back for empty input", () => {
    expect(deriveTitle("   ")).toBe("New chat");
  });

  it("truncates with an ellipsis and never exceeds the budget", () => {
    const title = deriveTitle("a".repeat(200), 48);
    expect(title.endsWith("\u2026")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);
  });

  it("leaves short input untouched", () => {
    expect(deriveTitle("Ship it")).toBe("Ship it");
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("approximates four characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("never rounds a non-empty string down to zero", () => {
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("initials", () => {
  it("takes the first letter of up to two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("handles a single word", () => {
    expect(initials("ada")).toBe("A");
  });

  it("falls back when the name is missing", () => {
    expect(initials(null)).toBe("U");
    expect(initials(undefined, "?" )).toBe("?");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Ready--  ")).toBe("ready");
  });

  it("falls back when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("conversation");
  });
});

describe("timeBucket", () => {
  it("buckets a fresh timestamp as Today", () => {
    expect(timeBucket(new Date().toISOString())).toBe("Today");
  });

  it("buckets a week-old timestamp as Older", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(timeBucket(old)).toBe("Older");
  });
});

describe("formatClock", () => {
  it("returns an empty string for an invalid date", () => {
    expect(formatClock("not-a-date")).toBe("");
  });

  it("formats a valid timestamp as HH:MM", () => {
    expect(formatClock("2026-01-02T03:04:00Z")).toMatch(/\d{1,2}:\d{2}/);
  });
});
