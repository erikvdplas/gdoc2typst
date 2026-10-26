import type { docs_v1 } from "@googleapis/docs";
import type { AssetWriter } from "./assets.js";

export interface Warning {
  kind: string;
  message: string;
}

export interface ConvertContext {
  lists: Record<string, docs_v1.Schema$List>;
  inlineObjects: Record<string, docs_v1.Schema$InlineObject>;
  positionedObjects: Record<string, docs_v1.Schema$PositionedObject>;
  footnotes: Record<string, docs_v1.Schema$Footnote>;
  assets: AssetWriter;
  /** File that image paths in this context are relative to. */
  moduleFile: string;
  warnings: Warning[];
  /** Optional image downloader; when absent, figure converter emits a warning. */
  downloadImage?: (
    contentUri: string,
  ) => Promise<{ bytes: Buffer; extension: string }>;
  renderBlocks(elements: docs_v1.Schema$StructuralElement[]): string;
  renderInlines(elements: docs_v1.Schema$ParagraphElement[]): string;
  warn(kind: string, message: string): void;
}

export function createBaseContext(
  partial: Omit<
    ConvertContext,
    "warnings" | "warn" | "renderBlocks" | "renderInlines" | "moduleFile"
  > &
    Partial<
      Pick<ConvertContext, "renderBlocks" | "renderInlines" | "moduleFile">
    >,
): ConvertContext {
  const warnings: Warning[] = [];
  const ctx: ConvertContext = {
    lists: partial.lists,
    inlineObjects: partial.inlineObjects,
    positionedObjects: partial.positionedObjects,
    footnotes: partial.footnotes,
    assets: partial.assets,
    moduleFile: partial.moduleFile ?? "document.typ",
    downloadImage: partial.downloadImage,
    warnings,
    renderBlocks:
      partial.renderBlocks ??
      (() => {
        throw new Error("renderBlocks not initialized");
      }),
    renderInlines:
      partial.renderInlines ??
      (() => {
        throw new Error("renderInlines not initialized");
      }),
    warn(kind, message) {
      warnings.push({ kind, message });
    },
  };
  return ctx;
}
