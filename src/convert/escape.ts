const SPECIAL = new Set([
  "\\",
  "#",
  "*",
  "_",
  "`",
  "$",
  "@",
  "<",
  ">",
  "[",
  "]",
]);

/**
 * Escape characters that have special meaning in Typst markup mode.
 */
export function escapeTypst(text: string): string {
  let result = "";
  for (const char of text) {
    if (char === "\u000b") {
      result += "\\\n";
      continue;
    }
    if (SPECIAL.has(char)) {
      result += `\\${char}`;
      continue;
    }
    result += char;
  }
  return result;
}

/**
 * Strip the trailing paragraph newline Docs stores on every text run / paragraph.
 */
export function stripTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, "");
}

/**
 * Escape a string for use inside a Typst string literal.
 */
export function escapeTypstString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function isValidTypstLabel(id: string): boolean {
  return LABEL_RE.test(id);
}

/**
 * Map a Docs heading/bookmark id to a Typst label identifier when possible.
 * Dots (common in Docs headingIds) become hyphens.
 */
export function toTypstLabel(id: string): string | null {
  const candidate = id.replace(/\./g, "-");
  return isValidTypstLabel(candidate) ? candidate : null;
}
