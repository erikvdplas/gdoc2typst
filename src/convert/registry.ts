import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "./context.js";

export type StructuralKind =
  | "paragraph"
  | "table"
  | "tableOfContents"
  | "sectionBreak";

export type InlineKind =
  | "textRun"
  | "inlineObjectElement"
  | "horizontalRule"
  | "pageBreak"
  | "columnBreak"
  | "footnoteReference"
  | "equation"
  | "autoText"
  | "person"
  | "richLink"
  | "date"
  | "dropdown";

export type StructuralConverter = (
  element: docs_v1.Schema$StructuralElement,
  ctx: ConvertContext,
) => string;

export type InlineConverter = (
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
) => string;

const STRUCTURAL_KINDS: StructuralKind[] = [
  "paragraph",
  "table",
  "tableOfContents",
  "sectionBreak",
];

const INLINE_KINDS: InlineKind[] = [
  "textRun",
  "inlineObjectElement",
  "horizontalRule",
  "pageBreak",
  "columnBreak",
  "footnoteReference",
  "equation",
  "autoText",
  "person",
  "richLink",
  "date",
  "dropdown",
];

export class ConverterRegistry {
  private structural = new Map<StructuralKind, StructuralConverter>();
  private inline = new Map<InlineKind, InlineConverter>();

  registerStructural(kind: StructuralKind, converter: StructuralConverter): void {
    this.structural.set(kind, converter);
  }

  registerInline(kind: InlineKind, converter: InlineConverter): void {
    this.inline.set(kind, converter);
  }

  convertStructural(
    element: docs_v1.Schema$StructuralElement,
    ctx: ConvertContext,
  ): string {
    for (const kind of STRUCTURAL_KINDS) {
      if (element[kind] != null) {
        const converter = this.structural.get(kind);
        if (converter) {
          return converter(element, ctx);
        }
        return this.fallbackStructural(kind, ctx);
      }
    }
    return this.fallbackStructural("unknown", ctx);
  }

  convertInline(
    element: docs_v1.Schema$ParagraphElement,
    ctx: ConvertContext,
  ): string {
    for (const kind of INLINE_KINDS) {
      // Schema uses date for dateElement in some versions; check both.
      const value =
        (element as Record<string, unknown>)[kind] ??
        (kind === "date"
          ? (element as { dateElement?: unknown }).dateElement
          : undefined);
      if (value != null) {
        const converter = this.inline.get(kind);
        if (converter) {
          return converter(element, ctx);
        }
        return this.fallbackInline(kind, ctx);
      }
    }
    return this.fallbackInline("unknown", ctx);
  }

  private fallbackStructural(kind: string, ctx: ConvertContext): string {
    ctx.warn(kind, `Unsupported structural element: ${kind}`);
    return `// unsupported: ${kind}\n`;
  }

  private fallbackInline(kind: string, ctx: ConvertContext): string {
    ctx.warn(kind, `Unsupported inline element: ${kind}`);
    return `/* unsupported: ${kind} */`;
  }
}

export function detectStructuralKind(
  element: docs_v1.Schema$StructuralElement,
): StructuralKind | null {
  for (const kind of STRUCTURAL_KINDS) {
    if (element[kind] != null) {
      return kind;
    }
  }
  return null;
}
