import { describe, expect, it } from "vitest";
import {
  escapeTypst,
  escapeTypstString,
  isValidTypstLabel,
  stripTrailingNewline,
  toTypstLabel,
} from "../src/convert/escape.js";

describe("escapeTypst", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeTypst("a#b*$")).toBe("a\\#b\\*\\$");
    expect(escapeTypst("x_y[z]")).toBe("x\\_y\\[z\\]");
  });

  it("turns vertical-tab soft breaks into Typst line breaks", () => {
    expect(escapeTypst("line1\u000bline2")).toBe("line1\\\nline2");
  });
});

describe("stripTrailingNewline", () => {
  it("removes a trailing newline from Docs paragraphs", () => {
    expect(stripTrailingNewline("Hello\n")).toBe("Hello");
    expect(stripTrailingNewline("Hello\r\n")).toBe("Hello");
    expect(stripTrailingNewline("Hello")).toBe("Hello");
  });
});

describe("escapeTypstString", () => {
  it("escapes quotes and backslashes for Typst strings", () => {
    expect(escapeTypstString('say "hi"\\')).toBe('say \\"hi\\"\\\\');
  });
});

describe("isValidTypstLabel", () => {
  it("accepts identifier-like heading ids", () => {
    expect(isValidTypstLabel("headingOne")).toBe(true);
    expect(isValidTypstLabel("_ok")).toBe(true);
  });

  it("rejects invalid labels", () => {
    expect(isValidTypstLabel("1abc")).toBe(false);
    expect(isValidTypstLabel("has space")).toBe(false);
    expect(isValidTypstLabel("h.abc_12")).toBe(false);
  });
});

describe("toTypstLabel", () => {
  it("replaces dots so Docs heading ids become valid labels", () => {
    expect(toTypstLabel("h.abc_12")).toBe("h-abc_12");
  });

  it("returns null for ids that cannot be sanitized", () => {
    expect(toTypstLabel("1abc")).toBeNull();
    expect(toTypstLabel("has space")).toBeNull();
  });
});
