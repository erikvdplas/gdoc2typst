import path from "node:path";
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
import { documentTabTree, type TabNode } from "./tab-tree.js";

export interface ConvertedTab {
  /** Path relative to the tabs directory, such as `01-chapter/02-body.typ`. */
  path: string;
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
   * Directory, relative to the main `.typ` file, that holds the top-level tab
   * modules. Default `tabs`. Child tabs are nested under their parent.
   */
  tabsDir?: string;
  /**
   * Absolute directory the tab modules are written to. Image paths inside a
   * nested tab are relative to that file. Defaults to `tabsDir`.
   */
  tabsOutputDir?: string;
  /** Absolute path of the main `.typ` file, used when a single tab is inlined. */
  outputFile?: string;
  /** When set, only these tab ids are converted. Omit to include every tab. */
  selectedTabIds?: ReadonlySet<string>;
}

interface TabSlice {
  title?: string | null;
  body?: docs_v1.Schema$Body | null;
  lists?: Record<string, docs_v1.Schema$List> | null;
  inlineObjects?: Record<string, docs_v1.Schema$InlineObject> | null;
  positionedObjects?: Record<string, docs_v1.Schema$PositionedObject> | null;
  footnotes?: Record<string, docs_v1.Schema$Footnote> | null;
}

function sliceFromTab(tab: docs_v1.Schema$Tab): TabSlice {
  return {
    title: tab.tabProperties?.title,
    body: tab.documentTab?.body,
    lists: tab.documentTab?.lists,
    inlineObjects: tab.documentTab?.inlineObjects,
    positionedObjects: tab.documentTab?.positionedObjects,
    footnotes: tab.documentTab?.footnotes,
  };
}

interface PlannedTab {
  slice: TabSlice;
  /** Path relative to the tabs directory, forward slashes. */
  path: string;
  children: PlannedTab[];
}

interface LevelEntry {
  node: TabNode;
  children: readonly TabNode[];
}

function nodesAtLevel(
  nodes: readonly TabNode[],
  selected: ReadonlySet<string> | undefined,
): LevelEntry[] {
  const entries: LevelEntry[] = [];
  for (const node of nodes) {
    const included = !selected || selected.has(node.id);
    if (included) {
      entries.push({ node, children: node.children });
    } else {
      entries.push(...nodesAtLevel(node.children, selected));
    }
  }
  return entries;
}

function planTabs(
  nodes: readonly TabNode[],
  selected: ReadonlySet<string> | undefined,
  directory = "",
): PlannedTab[] {
  return nodesAtLevel(nodes, selected).map((entry, index) => {
    const filename = tabFilename(index, entry.node.tab.tabProperties?.title);
    const stem = filename.slice(0, -".typ".length);
    const filePath = directory ? `${directory}/${filename}` : filename;
    const childDirectory = directory ? `${directory}/${stem}` : stem;
    return {
      slice: sliceFromTab(entry.node.tab),
      path: filePath,
      children: planTabs(entry.children, selected, childDirectory),
    };
  });
}

function countPlanned(tabs: readonly PlannedTab[]): number {
  return tabs.reduce((sum, tab) => sum + 1 + countPlanned(tab.children), 0);
}

export function includedTabCount(
  document: docs_v1.Schema$Document,
  selectedTabIds?: ReadonlySet<string>,
): number {
  const tree = documentTabTree(document);
  if (tree.length === 0) {
    return 1;
  }
  return countPlanned(planTabs(tree, selectedTabIds));
}

export function usesTabModules(document: docs_v1.Schema$Document): boolean {
  return includedTabCount(document) > 1;
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

function includePath(tabsDir: string, filePath: string): string {
  const dir = tabsDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return dir.length > 0 ? `${dir}/${filePath}` : filePath;
}

function includeFromParent(parentPath: string, childPath: string): string {
  const parentDir = path.posix.dirname(parentPath);
  const relative = path.posix.relative(parentDir, childPath);
  return relative;
}

function joinTypst(body: string, includes: string[]): string {
  const parts: string[] = [];
  if (body.trim().length > 0) {
    parts.push(body.trim());
  }
  if (includes.length > 0) {
    parts.push(includes.join("\n\n"));
  }
  return parts.length > 0 ? `${parts.join("\n\n")}\n` : "";
}

export async function convertDocument(
  document: docs_v1.Schema$Document,
  options: ConvertDocumentOptions,
): Promise<ConvertResult> {
  const registry = options.registry ?? createDefaultRegistry();
  const tree = documentTabTree(document);
  const allWarnings: Warning[] = [];

  if (tree.length === 0) {
    const body = await renderSlice(
      {
        title: document.title,
        body: document.body,
        lists: document.lists,
        inlineObjects: document.inlineObjects,
        positionedObjects: document.positionedObjects,
        footnotes: document.footnotes,
      },
      options.outputFile ?? "document.typ",
      options,
      registry,
      allWarnings,
    );
    return { typst: joinTypst(body, []), tabs: [], warnings: allWarnings };
  }

  const planned = planTabs(tree, options.selectedTabIds);
  if (countPlanned(planned) <= 1 && planned[0] && planned[0].children.length === 0) {
    const body = await renderSlice(
      planned[0].slice,
      options.outputFile ?? "document.typ",
      options,
      registry,
      allWarnings,
    );
    return { typst: joinTypst(body, []), tabs: [], warnings: allWarnings };
  }

  const tabsDir = options.tabsDir ?? "tabs";
  const tabsOutputDir = options.tabsOutputDir ?? tabsDir;
  const modules: ConvertedTab[] = [];

  const renderPlanned = async (tab: PlannedTab): Promise<void> => {
    const moduleFile = path.join(tabsOutputDir, ...tab.path.split("/"));
    const body = await renderSlice(tab.slice, moduleFile, options, registry, allWarnings);
    const includes = tab.children.map(
      (child) =>
        `#include "${escapeTypstString(includeFromParent(tab.path, child.path))}"`,
    );
    modules.push({ path: tab.path, typst: joinTypst(body, includes) });
    for (const child of tab.children) {
      await renderPlanned(child);
    }
  };

  for (const tab of planned) {
    await renderPlanned(tab);
  }

  const typst = joinTypst(
    "",
    planned.map(
      (tab) => `#include "${escapeTypstString(includePath(tabsDir, tab.path))}"`,
    ),
  );
  return { typst, tabs: modules, warnings: allWarnings };
}

async function renderSlice(
  tab: TabSlice,
  moduleFile: string,
  options: ConvertDocumentOptions,
  registry: ConverterRegistry,
  warnings: Warning[],
): Promise<string> {
  const ctx = createContextForTab(tab, options, registry);
  ctx.moduleFile = moduleFile;
  let body = ctx.renderBlocks(tab.body?.content ?? []);
  body = await resolveImagePlaceholders(body, ctx);
  warnings.push(...ctx.warnings);
  return body;
}
