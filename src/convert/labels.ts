import type { docs_v1 } from "@googleapis/docs";
import { stripTrailingNewline } from "./escape.js";

const HEADING_STYLES = new Set([
  "TITLE",
  "HEADING_1",
  "HEADING_2",
  "HEADING_3",
  "HEADING_4",
  "HEADING_5",
  "HEADING_6",
]);

export interface HeadingRef {
  headingId?: string | null;
  text: string;
}

export interface HeadingLabels {
  /** Typst label for a Google Docs heading id, when that heading was included. */
  byId: ReadonlyMap<string, string>;
  /** Next label in render order. Returns null when the queue is exhausted. */
  takeNext(): string | null;
}

/**
 * Kebab-case a heading into a Typst label stem.
 * "A beautiful Title" becomes "a-beautiful-title".
 */
export function slugifyHeading(text: string): string {
  const stripped = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = stripped.length > 0 ? stripped : "heading";
  return /^[a-z_]/.test(base) ? base : `_${base}`;
}

/**
 * Assign a unique label to each heading. A slug used once is kept as-is.
 * A slug used more than once is numbered in order: `slug-1`, `slug-2`, …
 */
export function assignHeadingLabels(headings: readonly HeadingRef[]): {
  byId: Map<string, string>;
  labels: string[];
} {
  const bases = headings.map((heading) => slugifyHeading(heading.text));
  const counts = new Map<string, number>();
  for (const base of bases) {
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const used = new Set<string>();
  const labels: string[] = [];
  const byId = new Map<string, string>();

  for (const [index, base] of bases.entries()) {
    const total = counts.get(base) ?? 1;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    let label = total === 1 ? base : `${base}-${n}`;
    if (used.has(label)) {
      let i = total === 1 ? 1 : n;
      while (used.has(`${base}-${i}`)) {
        i += 1;
      }
      label = `${base}-${i}`;
    }
    used.add(label);
    labels.push(label);

    const headingId = headings[index]?.headingId;
    if (headingId && !byId.has(headingId)) {
      byId.set(headingId, label);
    }
  }

  return { byId, labels };
}

export function createHeadingLabels(headings: readonly HeadingRef[]): HeadingLabels {
  const { byId, labels } = assignHeadingLabels(headings);
  let index = 0;
  return {
    byId,
    takeNext() {
      if (index >= labels.length) {
        return null;
      }
      const label = labels[index] ?? null;
      index += 1;
      return label;
    },
  };
}

/**
 * Headings in the order `convertParagraph` emits them, including headings
 * inside tables and footnotes.
 */
export function collectHeadingRefs(
  elements: readonly docs_v1.Schema$StructuralElement[],
  footnotes: Record<string, docs_v1.Schema$Footnote>,
): HeadingRef[] {
  const headings: HeadingRef[] = [];
  walkElements(elements, footnotes, headings);
  return headings;
}

function walkElements(
  elements: readonly docs_v1.Schema$StructuralElement[],
  footnotes: Record<string, docs_v1.Schema$Footnote>,
  headings: HeadingRef[],
): void {
  let i = 0;
  while (i < elements.length) {
    const element = elements[i]!;

    if (element.paragraph?.bullet) {
      const listId = element.paragraph.bullet.listId;
      while (i < elements.length) {
        const next = elements[i]!;
        if (next.paragraph?.bullet && next.paragraph.bullet.listId === listId) {
          walkParagraph(next.paragraph, footnotes, headings, false);
          i += 1;
        } else {
          break;
        }
      }
      continue;
    }

    if (element.paragraph) {
      const named = element.paragraph.paragraphStyle?.namedStyleType;
      walkParagraph(
        element.paragraph,
        footnotes,
        headings,
        Boolean(named && HEADING_STYLES.has(named)),
      );
    } else if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          const rowSpan = cell.tableCellStyle?.rowSpan ?? 1;
          const columnSpan = cell.tableCellStyle?.columnSpan ?? 1;
          if (rowSpan === 0 || columnSpan === 0) {
            continue;
          }
          walkElements(cell.content ?? [], footnotes, headings);
        }
      }
    }

    i += 1;
  }
}

function walkParagraph(
  paragraph: docs_v1.Schema$Paragraph,
  footnotes: Record<string, docs_v1.Schema$Footnote>,
  headings: HeadingRef[],
  recordHeading: boolean,
): void {
  for (const element of paragraph.elements ?? []) {
    const footnoteId = element.footnoteReference?.footnoteId;
    if (!footnoteId) {
      continue;
    }
    const footnote = footnotes[footnoteId];
    if (footnote) {
      walkElements(footnote.content ?? [], footnotes, headings);
    }
  }

  if (recordHeading) {
    headings.push({
      headingId: paragraph.paragraphStyle?.headingId,
      text: headingPlainText(paragraph),
    });
  }
}

function headingPlainText(paragraph: docs_v1.Schema$Paragraph): string {
  return (paragraph.elements ?? [])
    .map((element) =>
      element.textRun?.content ? stripTrailingNewline(element.textRun.content) : "",
    )
    .join("")
    .trim();
}
