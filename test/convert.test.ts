import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { docs_v1 } from "@googleapis/docs";
import { createMemoryAssetWriter } from "../src/convert/assets.js";
import { convertDocument } from "../src/convert/document.js";
import { ConverterRegistry } from "../src/convert/registry.js";
import { createDefaultRegistry } from "../src/convert/elements/index.js";
import { createBaseContext } from "../src/convert/context.js";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const simpleDoc = JSON.parse(
  readFileSync(join(fixtureDir, "fixtures/simple-doc.json"), "utf8"),
) as docs_v1.Schema$Document;

describe("convertDocument", () => {
  it("converts headings, styles, lists, tables, footnotes, and outline", async () => {
    const assets = createMemoryAssetWriter();
    const { typst, warnings } = await convertDocument(simpleDoc, {
      assets,
      downloadImage: async () => ({
        bytes: Buffer.from("fake-png"),
        extension: "png",
      }),
    });

    expect(typst).toContain("= Main Title <titleHeading>");
    expect(typst).toContain("#emph[A short subtitle]");
    expect(typst).toContain("= Section One <headingOne>");
    expect(typst).toContain("*bold*");
    expect(typst).toContain("_italic_");
    expect(typst).toContain("#emph[#strong[both]]");
    expect(typst).toContain('#link("https://typst.app")[Typst]');
    expect(typst).toContain("- First item");
    expect(typst).toContain("  - Nested item");
    expect(typst).toContain("- Second item");
    expect(typst).toContain("+ One");
    expect(typst).toContain("+ Two");
    expect(typst).toContain("#table(");
    expect(typst).toContain("table.cell(colspan: 2)[Merged]");
    expect(typst).toContain("#footnote[A footnote body]");
    expect(typst).toContain("#outline()");
    expect(typst).toContain("#line(length: 100%)");
    expect(typst).toMatch(/#figure\(image\("assets\/.+"\), caption: \[Diagram — An example figure\]\)/);
    expect(typst).not.toContain("#set document");
    expect(typst).not.toContain("#set page");
    expect(typst).not.toContain("#set text");
    expect(typst).not.toContain("#set heading");
    expect(warnings).toEqual([]);
  });

  it("includes each tab as its own module", async () => {
    const multiTab: docs_v1.Schema$Document = {
      title: "Tabs",
      tabs: [
        {
          tabProperties: { title: "First" },
          documentTab: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [
                      { textRun: { content: "A\n", textStyle: {} } },
                    ],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
        },
        {
          tabProperties: { title: "Second" },
          documentTab: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [
                      { textRun: { content: "B\n", textStyle: {} } },
                    ],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const { typst, tabs } = await convertDocument(multiTab, {
      assets: createMemoryAssetWriter(),
    });

    expect(typst).toBe(
      '#include "tabs/01-First.typ"\n\n#include "tabs/02-Second.typ"\n',
    );
    expect(tabs.map((tab) => tab.path)).toEqual([
      "01-First.typ",
      "02-Second.typ",
    ]);
    expect(tabs[0]?.typst).toBe("A\n");
    expect(tabs[1]?.typst).toBe("B\n");
    expect(typst).not.toContain("= First");
  });

  it("honors a custom tabs directory in include paths", async () => {
    const multiTab: docs_v1.Schema$Document = {
      tabs: [
        {
          tabProperties: { title: "One" },
          documentTab: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [{ textRun: { content: "A\n", textStyle: {} } }],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
        },
        {
          tabProperties: { title: "Two" },
          documentTab: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [{ textRun: { content: "B\n", textStyle: {} } }],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const { typst } = await convertDocument(multiTab, {
      assets: createMemoryAssetWriter(),
      tabsDir: "chapters",
    });

    expect(typst).toContain('#include "chapters/01-One.typ"');
    expect(typst).toContain('#include "chapters/02-Two.typ"');
  });
});

describe("ConverterRegistry fallback", () => {
  it("warns and comments on unknown structural elements", () => {
    const registry = new ConverterRegistry();
    const ctx = createBaseContext({
      lists: {},
      inlineObjects: {},
      positionedObjects: {},
      footnotes: {},
      assets: createMemoryAssetWriter(),
    });
    ctx.renderBlocks = (els) =>
      els.map((el) => registry.convertStructural(el, ctx)).join("");
    ctx.renderInlines = (els) =>
      els.map((el) => registry.convertInline(el, ctx)).join("");

    const out = registry.convertStructural(
      { tableOfContents: { content: [] } },
      ctx,
    );
    expect(out).toContain("unsupported: tableOfContents");
    expect(ctx.warnings[0]?.kind).toBe("tableOfContents");
  });

  it("registers converters via createDefaultRegistry", () => {
    const registry = createDefaultRegistry();
    const ctx = createBaseContext({
      lists: {},
      inlineObjects: {},
      positionedObjects: {},
      footnotes: {},
      assets: createMemoryAssetWriter(),
    });
    ctx.renderBlocks = () => "";
    ctx.renderInlines = () => "";

    const out = registry.convertStructural(
      { tableOfContents: { content: [] } },
      ctx,
    );
    expect(out).toBe("#outline()");
  });
});
