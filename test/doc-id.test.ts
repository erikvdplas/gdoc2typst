import { describe, expect, it } from "vitest";
import { parseDocumentId, sanitizeFilename } from "../src/util/doc-id.js";

describe("parseDocumentId", () => {
  it("parses a docs.google.com URL", () => {
    expect(
      parseDocumentId(
        "https://docs.google.com/document/d/1abcDEF_-/edit?usp=sharing",
      ),
    ).toBe("1abcDEF_-");
  });

  it("accepts a bare id", () => {
    expect(parseDocumentId("1abcDEF_-")).toBe("1abcDEF_-");
  });

  it("rejects empty and invalid input", () => {
    expect(() => parseDocumentId("")).toThrow(/required/i);
    expect(() => parseDocumentId("https://example.com/x")).toThrow(/Could not parse/);
  });
});

describe("sanitizeFilename", () => {
  it("produces a filesystem-friendly basename", () => {
    expect(sanitizeFilename("My Cool Doc!")).toBe("My-Cool-Doc");
  });

  it("falls back when the title has no safe characters", () => {
    expect(sanitizeFilename("!!!")).toBe("document");
  });
});
