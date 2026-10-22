import { describe, expect, it } from "vitest";
import {
  SLASH_COMMANDS,
  matchSlashCommands,
  parseSlashCommand,
  type SlashCommand,
} from "@/lib/commands";

describe("SLASH_COMMANDS", () => {
  it("has unique ids", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only marks action commands as local", () => {
    for (const command of SLASH_COMMANDS) {
      if (command.local) expect(command.kind).toBe("action");
    }
  });

  it("gives every tool command at least one tool", () => {
    for (const command of SLASH_COMMANDS) {
      if (command.kind === "tool") expect(command.tools?.length).toBeGreaterThan(0);
    }
  });

  it("exposes the documented commands", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    for (const expected of ["new", "export", "search", "tools", "web", "calc", "code", "image"]) {
      expect(ids).toContain(expected);
    }
  });
});

describe("parseSlashCommand", () => {
  it("detects a bare slash", () => {
    expect(parseSlashCommand("/")).toEqual({ query: "" });
  });

  it("captures the query after the slash", () => {
    expect(parseSlashCommand("/web")).toEqual({ query: "web" });
  });

  it("closes once a space is typed, so real prose is unaffected", () => {
    expect(parseSlashCommand("/web search this")).toBeNull();
  });

  it("ignores input that does not start with a slash", () => {
    expect(parseSlashCommand("hello")).toBeNull();
  });

  it("ignores a slash in the middle of a sentence", () => {
    expect(parseSlashCommand("either/or")).toBeNull();
  });

  it("ignores an empty string", () => {
    expect(parseSlashCommand("")).toBeNull();
  });
});

describe("matchSlashCommands", () => {
  it("returns everything for an empty query", () => {
    expect(matchSlashCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("ranks an exact id first", () => {
    expect(matchSlashCommands("web")[0].id).toBe("web");
  });

  it("matches on a keyword", () => {
    const results = matchSlashCommands("math");
    expect(results.map((c: SlashCommand) => c.id)).toContain("calc");
  });

  it("matches on a label prefix", () => {
    const results = matchSlashCommands("generate");
    expect(results.map((c) => c.id)).toContain("image");
  });

  it("is case-insensitive", () => {
    expect(matchSlashCommands("WEB")[0].id).toBe("web");
  });

  it("returns nothing for a query that matches no command", () => {
    expect(matchSlashCommands("zzzzzz")).toHaveLength(0);
  });

  it("ranks an id-prefix match above a keyword-only match", () => {
    const ids = matchSlashCommands("c").map((c) => c.id);
    // `calc` matches by id prefix; `new` only matches on its "clear" keyword.
    expect(ids.indexOf("calc")).toBeLessThan(ids.indexOf("new"));
  });

  it("keeps source order within the same score tier", () => {
    const ids = matchSlashCommands("c").map((c) => c.id);
    // `calc` and `code` both match by id prefix, so table order must survive.
    const calcIndex = ids.indexOf("calc");
    const codeIndex = ids.indexOf("code");
    expect(calcIndex).toBeGreaterThanOrEqual(0);
    expect(codeIndex).toBeGreaterThan(calcIndex);
  });
});
