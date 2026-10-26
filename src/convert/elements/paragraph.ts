import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";
import { toTypstLabel } from "../escape.js";

const HEADING_MARKERS: Record<string, string> = {
  TITLE: "=",
  HEADING_1: "=",
  HEADING_2: "==",
  HEADING_3: "===",
  HEADING_4: "====",
  HEADING_5: "=====",
  HEADING_6: "======",
};

export function convertParagraph(
  element: docs_v1.Schema$StructuralElement,
  ctx: ConvertContext,
): string {
  const paragraph = element.paragraph;
  if (!paragraph) {
    return "";
  }

  const style = paragraph.paragraphStyle;
  const named = style?.namedStyleType ?? "NORMAL_TEXT";
  const inlines = ctx.renderInlines(paragraph.elements ?? []);

  // Positioned objects tethered to this paragraph
  const positioned = (paragraph.positionedObjectIds ?? [])
    .map((id) => renderPositionedObject(id, ctx))
    .filter(Boolean)
    .join("\n");

  if (named === "SUBTITLE") {
    const body = inlines.trim() ? `#emph[${inlines}]` : "";
    return joinBlocks(body, positioned);
  }

  const marker = HEADING_MARKERS[named];
  if (marker) {
    const headingId = style?.headingId;
    const typstLabel = headingId ? toTypstLabel(headingId) : null;
    const label = typstLabel ? ` <${typstLabel}>` : "";
    const text = inlines.trim() || "";
    return joinBlocks(`${marker} ${text}${label}`, positioned);
  }

  // Bullet lists are handled by the document walker; a lone bullet paragraph
  // that somehow reaches here is still rendered as a list item.
  if (paragraph.bullet) {
    return renderListItem(paragraph, inlines, ctx);
  }

  return joinBlocks(inlines, positioned);
}

export function renderListItem(
  paragraph: docs_v1.Schema$Paragraph,
  inlines: string,
  ctx: ConvertContext,
): string {
  const bullet = paragraph.bullet!;
  const nesting = bullet.nestingLevel ?? 0;
  const indent = "  ".repeat(nesting);
  const list = bullet.listId ? ctx.lists[bullet.listId] : undefined;
  const level = list?.listProperties?.nestingLevels?.[nesting];
  const ordered = Boolean(level?.glyphType && level.glyphType !== "NONE");
  const marker = ordered ? "+" : "-";
  return `${indent}${marker} ${inlines.trim()}`;
}

function renderPositionedObject(id: string, ctx: ConvertContext): string {
  if (!ctx.positionedObjects[id] && !ctx.inlineObjects[id]) {
    ctx.warn("positionedObject", `Missing positioned object: ${id}`);
    return "";
  }
  // Resolved asynchronously by resolveImagePlaceholders.
  return `__IMAGE__:${id}`;
}

function joinBlocks(...parts: string[]): string {
  return parts.filter((p) => p.trim().length > 0).join("\n");
}
