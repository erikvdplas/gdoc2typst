import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";

export function convertTable(
  element: docs_v1.Schema$StructuralElement,
  ctx: ConvertContext,
): string {
  const table = element.table;
  if (!table) {
    return "";
  }

  const columns = table.columns ?? inferColumns(table);
  const cells: string[] = [];

  for (const row of table.tableRows ?? []) {
    for (const cell of row.tableCells ?? []) {
      const style = cell.tableCellStyle;
      const rowSpan = style?.rowSpan ?? 1;
      const columnSpan = style?.columnSpan ?? 1;

      // Covered cells of a merge have span 0 and must be skipped.
      if (rowSpan === 0 || columnSpan === 0) {
        continue;
      }

      const content = ctx.renderBlocks(cell.content ?? []).trim();
      const body = content.length > 0 ? content : "";

      if (rowSpan > 1 || columnSpan > 1) {
        const args: string[] = [];
        if (columnSpan > 1) args.push(`colspan: ${columnSpan}`);
        if (rowSpan > 1) args.push(`rowspan: ${rowSpan}`);
        cells.push(`table.cell(${args.join(", ")})[${body}]`);
      } else {
        cells.push(`[${body}]`);
      }
    }
  }

  if (cells.length === 0) {
    return `#table(columns: ${columns})`;
  }

  return `#table(\n  columns: ${columns},\n  ${cells.join(",\n  ")},\n)`;
}

function inferColumns(table: docs_v1.Schema$Table): number {
  let max = 0;
  for (const row of table.tableRows ?? []) {
    max = Math.max(max, row.tableCells?.length ?? 0);
  }
  return max || 1;
}
