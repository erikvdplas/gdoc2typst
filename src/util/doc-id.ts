/**
 * Accept a bare Docs document id or a docs.google.com URL and return the id.
 */
export function parseDocumentId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Document id or URL is required.");
  }

  const urlMatch = trimmed.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(
    `Could not parse a Google Docs document id from: ${input}`,
  );
}

export function sanitizeFilename(title: string): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "document";
}
