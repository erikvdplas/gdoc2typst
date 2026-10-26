import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";
import { renderListItem } from "./paragraph.js";

/**
 * Convert a contiguous run of bulleted paragraphs into Typst list markup.
 */
export function convertListRun(
  paragraphs: docs_v1.Schema$Paragraph[],
  ctx: ConvertContext,
): string {
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const inlines = ctx.renderInlines(paragraph.elements ?? []);
    lines.push(renderListItem(paragraph, inlines, ctx));
  }
  return lines.join("\n");
}

export function isOrderedList(
  listId: string | null | undefined,
  nestingLevel: number,
  ctx: ConvertContext,
): boolean {
  if (!listId) return false;
  const list = ctx.lists[listId];
  const level = list?.listProperties?.nestingLevels?.[nestingLevel];
  return Boolean(level?.glyphType && level.glyphType !== "NONE");
}
