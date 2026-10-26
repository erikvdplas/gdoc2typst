import type { docs_v1 } from "@googleapis/docs";
import type { AssetWriter } from "./assets.js";
import { createBaseContext, type ConvertContext, type Warning } from "./context.js";
import {
  createDefaultRegistry,
  convertListRun,
  resolveImagePlaceholders,
} from "./elements/index.js";
import type { ConverterRegistry } from "./registry.js";
import { escapeTypstString } from "./escape.js";
import { sanitizeFilename } from "../util/doc-id.js";

export interface ConvertedTab {
  /** File name inside the tabs directory, such as `01-introduction.typ`. */
  filename: string;
  typst: string;
}

export interface ConvertResult {
  /** Main file. A single tab is inlined; several tabs are `#include` lines. */
  typst: string;
  tabs: ConvertedTab[];
  warnings: Warning[];
}

export interface ConvertDocumentOptions {
  assets: AssetWriter;
  downloadImage?: ConvertContext["downloadImage"];
  registry?: ConverterRegistry;
  /**
   * Directory, relative to the main `.typ` file, that holds one module per tab.
   * Used only when the document has more than one tab. Default `tabs`.
   */
  tabsDir?: string;
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

export function usesTabModules(document: docs_v1.Schema$Document): boolean {
  return flattenTabs(document.tabs).length > 1;
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

function tabFilename(index: number, title: string | null | undefined): string {
  const stem = title?.trim() ? sanitizeFilename(title) : "tab";
  const prefix = String(index + 1).padStart(2, "0");
  return `${prefix}-${stem}.typ`;
}

function includePath(tabsDir: string, filename: string): string {
  const dir = tabsDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return dir.length > 0 ? `${dir}/${filename}` : filename;
}

export async function convertDocument(
  document: docs_v1.Schema$Document,
  options: ConvertDocumentOptions,
): Promise<ConvertResult> {
  const registry = options.registry ?? createDefaultRegistry();
  const tabs = collectTabs(document);
  const splitTabs = tabs.length > 1;
  const tabsDir = options.tabsDir ?? "tabs";
  const modules: ConvertedTab[] = [];
  const allWarnings: Warning[] = [];

  for (const [index, tab] of tabs.entries()) {
    const ctx = createContextForTab(tab, options, registry);
    let body = ctx.renderBlocks(tab.body?.content ?? []);
    body = await resolveImagePlaceholders(body, ctx);
    allWarnings.push(...ctx.warnings);
    const typst = body.trim();
    const withNewline = typst.length > 0 ? `${typst}\n` : "";

    if (splitTabs) {
      modules.push({
        filename: tabFilename(index, tab.title),
        typst: withNewline,
      });
    } else {
      return { typst: withNewline, tabs: [], warnings: allWarnings };
    }
  }

  const includes = modules
    .map(
      (tab) =>
        `#include "${escapeTypstString(includePath(tabsDir, tab.filename))}"`,
    )
    .join("\n\n");
  const typst = includes.length > 0 ? `${includes}\n` : "";
  return { typst, tabs: modules, warnings: allWarnings };
}
