import { docs, type docs_v1 } from "@googleapis/docs";
import type { OAuth2Client } from "google-auth-library";

export type DocsDocument = docs_v1.Schema$Document;

export async function fetchDocument(
  auth: OAuth2Client,
  documentId: string,
): Promise<DocsDocument> {
  const client = docs({ version: "v1", auth });
  const response = await client.documents.get({
    documentId,
    includeTabsContent: true,
  });
  if (!response.data) {
    throw new Error(`Empty response for document ${documentId}`);
  }
  return response.data;
}
