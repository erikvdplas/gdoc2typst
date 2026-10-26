import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";
import { escapeTypst } from "../escape.js";

export function convertTableOfContents(
  _element: docs_v1.Schema$StructuralElement,
  _ctx: ConvertContext,
): string {
  return "#outline()";
}

export function convertSectionBreak(
  _element: docs_v1.Schema$StructuralElement,
  _ctx: ConvertContext,
): string {
  return "";
}

export function convertHorizontalRule(
  _element: docs_v1.Schema$ParagraphElement,
  _ctx: ConvertContext,
): string {
  return "#line(length: 100%)";
}

export function convertPageBreak(
  _element: docs_v1.Schema$ParagraphElement,
  _ctx: ConvertContext,
): string {
  return "";
}

export function convertColumnBreak(
  _element: docs_v1.Schema$ParagraphElement,
  _ctx: ConvertContext,
): string {
  return "";
}

export function convertFootnoteReference(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  const ref = element.footnoteReference;
  const footnoteId = ref?.footnoteId;
  if (!footnoteId) {
    return "";
  }
  const footnote = ctx.footnotes[footnoteId];
  if (!footnote) {
    ctx.warn("footnote", `Missing footnote body: ${footnoteId}`);
    return "";
  }
  const body = ctx.renderBlocks(footnote.content ?? []).trim();
  return `#footnote[${body}]`;
}

export function convertEquation(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  ctx.warn(
    "equation",
    "Google Docs equations are not exported as math; emitting a placeholder.",
  );
  // Docs equations do not include LaTeX source in the API response.
  void element;
  return `/* equation */`;
}

export function convertPerson(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  const person = element.person;
  const name =
    person?.personProperties?.name ??
    person?.personProperties?.email ??
    "person";
  ctx.warn("person", `Person chip rendered as plain text: ${name}`);
  return escapeTypst(name);
}

export function convertRichLink(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  const rich = element.richLink;
  const title = rich?.richLinkProperties?.title;
  const uri = rich?.richLinkProperties?.uri;
  if (uri && title) {
    return `#link("${uri.replace(/"/g, '\\"')}")[${escapeTypst(title)}]`;
  }
  if (title) {
    return escapeTypst(title);
  }
  ctx.warn("richLink", "Rich link without title or URI");
  return "";
}

export function convertAutoText(
  element: docs_v1.Schema$ParagraphElement,
  _ctx: ConvertContext,
): string {
  // Page numbers etc. — omit for include-friendly output.
  void element;
  return "";
}

export function convertUnsupportedInline(
  kind: string,
): (element: docs_v1.Schema$ParagraphElement, ctx: ConvertContext) => string {
  return (_element, ctx) => {
    ctx.warn(kind, `Unsupported inline element: ${kind}`);
    return `/* unsupported: ${kind} */`;
  };
}
