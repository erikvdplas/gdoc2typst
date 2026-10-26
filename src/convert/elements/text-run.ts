import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";
import {
  escapeTypst,
  escapeTypstString,
  stripTrailingNewline,
  toTypstLabel,
} from "../escape.js";

function wrapFunction(name: string, body: string): string {
  return `#${name}[${body}]`;
}

/**
 * Apply structural inline styles. Color/font/size are ignored by design.
 */
export function styleText(
  text: string,
  style: docs_v1.Schema$TextStyle | undefined | null,
  ctx: ConvertContext,
): string {
  if (!text) {
    return "";
  }

  let body = escapeTypst(text);
  if (!style) {
    return body;
  }

  const marks: string[] = [];
  if (style.bold) marks.push("strong");
  if (style.italic) marks.push("emph");
  if (style.underline) marks.push("underline");
  if (style.strikethrough) marks.push("strike");

  if (style.baselineOffset === "SUPERSCRIPT") {
    marks.push("super");
  } else if (style.baselineOffset === "SUBSCRIPT") {
    marks.push("sub");
  }

  if (marks.length === 1) {
    const mark = marks[0]!;
    if (mark === "strong") {
      body = `*${body}*`;
    } else if (mark === "emph") {
      body = `_${body}_`;
    } else {
      body = wrapFunction(mark, body);
    }
  } else if (marks.length > 1) {
    // Outer to inner: strike, underline, italic, bold, super/sub (link applied later).
    // Wrap from inner to outer so the first listed mark ends up outermost.
    const order = ["strike", "underline", "emph", "strong", "super", "sub"];
    const ordered = order.filter((m) => marks.includes(m));
    for (const mark of [...ordered].reverse()) {
      body = wrapFunction(mark, body);
    }
  }

  const link = style.link;
  if (link) {
    if (link.url) {
      body = `#link("${escapeTypstString(link.url)}")[${body}]`;
    } else {
      const headingId = link.headingId ?? link.heading?.id;
      const bookmarkId = link.bookmarkId ?? link.bookmark?.id;
      const target = headingId ?? bookmarkId;
      let label: string | null = null;
      if (headingId && ctx.headingLabels) {
        label = ctx.headingLabels.byId.get(headingId) ?? null;
      } else if (target) {
        label = toTypstLabel(target);
      }
      if (label) {
        body = `#link(<${label}>)[${body}]`;
      } else {
        ctx.warn(
          "link",
          `Internal link target could not be mapped to a Typst label: ${target ?? "(missing)"}`,
        );
      }
    }
  }

  return body;
}

export function convertTextRun(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  const run = element.textRun;
  if (!run?.content) {
    return "";
  }
  const content = stripTrailingNewline(run.content);
  return styleText(content, run.textStyle, ctx);
}
