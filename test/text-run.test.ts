import { describe, expect, it } from "vitest";
import { createMemoryAssetWriter } from "../src/convert/assets.js";
import { createBaseContext } from "../src/convert/context.js";
import { convertTextRun, styleText } from "../src/convert/elements/text-run.js";

function makeCtx() {
  const ctx = createBaseContext({
    lists: {},
    inlineObjects: {},
    positionedObjects: {},
    footnotes: {},
    assets: createMemoryAssetWriter(),
  });
  ctx.renderBlocks = () => "";
  ctx.renderInlines = () => "";
  return ctx;
}

describe("styleText", () => {
  it("uses shorthand for single marks", () => {
    const ctx = makeCtx();
    expect(styleText("x", { bold: true }, ctx)).toBe("*x*");
    expect(styleText("y", { italic: true }, ctx)).toBe("_y_");
  });

  it("nests function forms for combined marks", () => {
    const ctx = makeCtx();
    expect(styleText("z", { bold: true, italic: true, underline: true }, ctx)).toBe(
      "#underline[#emph[#strong[z]]]",
    );
  });

  it("wraps links outermost", () => {
    const ctx = makeCtx();
    expect(
      styleText("go", { bold: true, link: { url: "https://example.com" } }, ctx),
    ).toBe('#link("https://example.com")[*go*]');
  });

  it("maps superscript and subscript", () => {
    const ctx = makeCtx();
    expect(styleText("2", { baselineOffset: "SUPERSCRIPT" }, ctx)).toBe(
      "#super[2]",
    );
    expect(styleText("i", { baselineOffset: "SUBSCRIPT" }, ctx)).toBe("#sub[i]");
  });
});

describe("convertTextRun", () => {
  it("strips trailing newlines before escaping", () => {
    const ctx = makeCtx();
    expect(
      convertTextRun(
        { textRun: { content: "Hi #\n", textStyle: {} } },
        ctx,
      ),
    ).toBe("Hi \\#");
  });
});
