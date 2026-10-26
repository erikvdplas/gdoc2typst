import type { docs_v1 } from "@googleapis/docs";
import type { AssetWriter } from "./assets.js";
import { createBaseContext, type ConvertContext, type Warning } from "./context.js";
import {
  createDefaultRegistry,
  convertListRun,
  resolveImagePlaceholders,
} from "./elements/index.js";
import type { ConverterRegistry } from "./registry.js";
import { escapeTypst } from "./escape.js";

export interface ConvertResult {
  typst: string;
  warnings: Warning[];
}

export interface ConvertDocumentOptions {
  assets: AssetWriter;
  downloadImage?: ConvertContext["downloadImage"];
  registry?: ConverterRegistry;
}

interface TabSlice {
  title?: string | null;
  body?: docs_v1.Schema$Body | null;
  lists?: Record<string, docs_v1.Schema$List> | null;
  inlineObjects?: Record<string, docs_v1.Schema$InlineObject> | null;
  positionedObjects?: Record<string, docs_v1.Schema$PositionedObject> | null;
  footnotes?: Record<string, docs_v1.Schema$Footnote> | null;
}

function flattenTabs(tabs: docs_v1.Schema$Tab[] | undefined | null): TabSlice[] {
  const result: TabSlice[] = [];
  const visit = (tab: docs_v1.Schema$Tab) => {
    if (tab.documentTab) {
      result.push({
        title: tab.tabProperties?.title,
        body: tab.documentTab.body,
        lists: tab.documentTab.lists,
        inlineObjects: tab.documentTab.inlineObjects,
        positionedObjects: tab.documentTab.positionedObjects,
        footnotes: tab.documentTab.footnotes,
      });
    }
    for (const child of tab.childTabs ?? []) {
      visit(child);
    }
  };
  for (const tab of tabs ?? []) {
    visit(tab);
  }
  return result;
}

function collectTabs(document: docs_v1.Schema$Document): TabSlice[] {
  const fromTabs = flattenTabs(document.tabs);
  if (fromTabs.length > 0) {
    return fromTabs;
  }
  // Legacy top-level body
  return [
    {
      title: document.title,
      body: document.body,
      lists: document.lists,
      inlineObjects: document.inlineObjects,
      positionedObjects: document.positionedObjects,
      footnotes: document.footnotes,
    },
  ];
}

function createContextForTab(
  tab: TabSlice,
  options: ConvertDocumentOptions,
  registry: ConverterRegistry,
): ConvertContext {
  const ctx = createBaseContext({
    lists: tab.lists ?? {},
    inlineObjects: tab.inlineObjects ?? {},
    positionedObjects: tab.positionedObjects ?? {},
    footnotes: tab.footnotes ?? {},
    assets: options.assets,
    downloadImage: options.downloadImage,
  });

  ctx.renderInlines = (elements) =>
    (elements ?? [])
      .map((el) => registry.convertInline(el, ctx))
      .join("");

  ctx.renderBlocks = (elements) => renderStructuralRun(elements ?? [], ctx, registry);

  return ctx;
}

function renderStructuralRun(
  elements: docs_v1.Schema$StructuralElement[],
  ctx: ConvertContext,
  registry: ConverterRegistry,
): string {
  const parts: string[] = [];
  let i = 0;

  while (i < elements.length) {
    const element = elements[i]!;

    if (element.paragraph?.bullet) {
      const listId = element.paragraph.bullet.listId;
      const run: docs_v1.Schema$Paragraph[] = [];
      while (i < elements.length) {
        const next = elements[i]!;
        if (
          next.paragraph?.bullet &&
          next.paragraph.bullet.listId === listId
        ) {
          run.push(next.paragraph);
          i += 1;
        } else {
          break;
        }
      }
      parts.push(convertListRun(run, ctx));
      continue;
    }

    const converted = registry.convertStructural(element, ctx);
    if (converted.trim().length > 0) {
      parts.push(converted.trimEnd());
    }
    i += 1;
  }

  return parts.join("\n\n");
}

export async function convertDocument(
  document: docs_v1.Schema$Document,
  options: ConvertDocumentOptions,
): Promise<ConvertResult> {
  const registry = options.registry ?? createDefaultRegistry();
  const tabs = collectTabs(document);
  const multiTab = tabs.length > 1;
  const sections: string[] = [];
  const allWarnings: Warning[] = [];

  for (const tab of tabs) {
    const ctx = createContextForTab(tab, options, registry);
    let body = ctx.renderBlocks(tab.body?.content ?? []);
    body = await resolveImagePlaceholders(body, ctx);
    allWarnings.push(...ctx.warnings);

    if (multiTab && tab.title) {
      sections.push(`= ${escapeTypst(tab.title)}\n\n${body}`.trim());
    } else {
      sections.push(body.trim());
    }
  }

  const typst = sections.filter(Boolean).join("\n\n") + (sections.some(Boolean) ? "\n" : "");
  return { typst, warnings: allWarnings };
}
