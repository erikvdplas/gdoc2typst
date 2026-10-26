import { describe, expect, it } from "vitest";
import type { docs_v1 } from "@googleapis/docs";
import { createMemoryAssetWriter } from "../src/convert/assets.js";
import { convertDocument } from "../src/convert/document.js";
import {
  applyTreeKey,
  checkState,
  documentTabTree,
  initialTabTreeState,
  renderTabTree,
  type TabNode,
} from "../src/convert/tab-tree.js";

function node(
  id: string,
  title: string,
  children: TabNode[] = [],
): TabNode {
  return {
    id,
    title,
    tab: { tabProperties: { tabId: id, title } },
    children,
  };
}

const tree: TabNode[] = [
  node("chapter", "Chapter", [node("intro", "Intro"), node("body", "Body")]),
  node("appendix", "Appendix"),
];

describe("tab tree selection", () => {
  it("starts with every tab selected and every branch collapsed", () => {
    const state = initialTabTreeState(tree);
    expect([...state.selected].sort()).toEqual(["appendix", "body", "chapter", "intro"]);
    expect(state.expanded.size).toBe(0);
    expect(renderTabTree(tree, state)).toBe(
      ["> > [x] Chapter", "    [x] Appendix"].join("\n"),
    );
  });

  it("expands with right and toggles a leaf with space", () => {
    const state = initialTabTreeState(tree);
    applyTreeKey(tree, state, "right");
    expect(state.expanded.has("chapter")).toBe(true);
    applyTreeKey(tree, state, "right");
    expect(state.cursor).toBe("intro");
    applyTreeKey(tree, state, "space");
    expect(state.selected.has("intro")).toBe(false);
    expect(checkState(tree[0]!, state.selected)).toBe("indeterminate");
    expect(renderTabTree(tree, state)).toContain("[-] Chapter");
    expect(renderTabTree(tree, state)).toContain("[ ] Intro");
  });

  it("space on a parent selects or clears the whole branch", () => {
    const state = initialTabTreeState(tree);
    state.cursor = "chapter";
    applyTreeKey(tree, state, "space");
    expect(state.selected.has("chapter")).toBe(false);
    expect(state.selected.has("intro")).toBe(false);
    expect(state.selected.has("body")).toBe(false);
    expect(state.selected.has("appendix")).toBe(true);
    expect(checkState(tree[0]!, state.selected)).toBe("unchecked");

    applyTreeKey(tree, state, "space");
    expect(checkState(tree[0]!, state.selected)).toBe("checked");
  });

  it("left collapses an open branch, then moves to the parent", () => {
    const state = initialTabTreeState(tree);
    applyTreeKey(tree, state, "right");
    applyTreeKey(tree, state, "down");
    expect(state.cursor).toBe("intro");
    applyTreeKey(tree, state, "left");
    expect(state.cursor).toBe("chapter");
    applyTreeKey(tree, state, "left");
    expect(state.expanded.has("chapter")).toBe(false);
  });
});

describe("convertDocument tab filter", () => {
  const document: docs_v1.Schema$Document = {
    title: "Book",
    tabs: [
      {
        tabProperties: { tabId: "chapter", title: "Chapter" },
        documentTab: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: "Parent\n", textStyle: {} } }],
                  paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                },
              },
            ],
          },
        },
        childTabs: [
          {
            tabProperties: { tabId: "intro", title: "Intro" },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: "Hello\n", textStyle: {} } }],
                      paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                    },
                  },
                ],
              },
            },
          },
          {
            tabProperties: { tabId: "body", title: "Body" },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: "World\n", textStyle: {} } }],
                      paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  it("reads the tab tree from the document", () => {
    const parsed = documentTabTree(document);
    expect(parsed.map((tab) => tab.id)).toEqual(["chapter"]);
    expect(parsed[0]?.children.map((tab) => tab.title)).toEqual(["Intro", "Body"]);
  });

  it("drops unchecked tabs and keeps the rest in tree order", async () => {
    const { typst, tabs } = await convertDocument(document, {
      assets: createMemoryAssetWriter(),
      selectedTabIds: new Set(["chapter", "body"]),
    });

    expect(tabs.map((tab) => tab.path)).toEqual([
      "01-Chapter.typ",
      "01-Chapter/01-Body.typ",
    ]);
    expect(tabs[0]?.typst).toBe(
      'Parent\n\n#include "01-Chapter/01-Body.typ"\n',
    );
    expect(tabs[1]?.typst).toBe("World\n");
    expect(typst).toBe('#include "tabs/01-Chapter.typ"\n');
    expect(typst).not.toContain("Intro");
  });

  it("nests grandchildren in a directory named after the child tab", async () => {
    const nested: docs_v1.Schema$Document = {
      tabs: [
        {
          tabProperties: { tabId: "chapter", title: "Chapter" },
          documentTab: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [{ textRun: { content: "Parent\n", textStyle: {} } }],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
          childTabs: [
            {
              tabProperties: { tabId: "body", title: "Body" },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: "Section\n", textStyle: {} } }],
                        paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                      },
                    },
                  ],
                },
              },
              childTabs: [
                {
                  tabProperties: { tabId: "detail", title: "Detail" },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              { textRun: { content: "Note\n", textStyle: {} } },
                            ],
                            paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { typst, tabs } = await convertDocument(nested, {
      assets: createMemoryAssetWriter(),
    });

    expect(typst).toBe('#include "tabs/01-Chapter.typ"\n');
    expect(tabs.map((tab) => tab.path)).toEqual([
      "01-Chapter.typ",
      "01-Chapter/01-Body.typ",
      "01-Chapter/01-Body/01-Detail.typ",
    ]);
    expect(tabs[0]?.typst).toContain('#include "01-Chapter/01-Body.typ"');
    expect(tabs[1]?.typst).toContain('#include "01-Body/01-Detail.typ"');
    expect(tabs[2]?.typst).toBe("Note\n");
  });
});
