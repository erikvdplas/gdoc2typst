import { describe, expect, it } from "vitest";
import { assignHeadingLabels, slugifyHeading } from "../src/convert/labels.js";

describe("slugifyHeading", () => {
  it("kebab-cases heading text", () => {
    expect(slugifyHeading("A beautiful Title")).toBe("a-beautiful-title");
  });

  it("drops apostrophes and accents", () => {
    expect(slugifyHeading("Don't naïve")).toBe("dont-naive");
  });

  it("prefixes a stem that would not be a Typst label", () => {
    expect(slugifyHeading("2024 Report")).toBe("_2024-report");
    expect(slugifyHeading("...")).toBe("heading");
  });
});

describe("assignHeadingLabels", () => {
  it("leaves a unique slug unsuffixed and numbers duplicates from 1", () => {
    const { labels } = assignHeadingLabels([
      { text: "Intro" },
      { text: "A beautiful Title" },
      { text: "A beautiful Title" },
    ]);
    expect(labels).toEqual([
      "intro",
      "a-beautiful-title-1",
      "a-beautiful-title-2",
    ]);
  });

  it("maps each heading id to its numbered label", () => {
    const { byId } = assignHeadingLabels([
      { headingId: "h.1", text: "A beautiful Title" },
      { headingId: "h.2", text: "A beautiful Title" },
    ]);
    expect(byId.get("h.1")).toBe("a-beautiful-title-1");
    expect(byId.get("h.2")).toBe("a-beautiful-title-2");
  });
});
