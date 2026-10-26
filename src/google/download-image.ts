import type { OAuth2Client } from "google-auth-library";

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface DownloadedImage {
  bytes: Buffer;
  extension: string;
  contentType: string;
}

export async function downloadImage(
  auth: OAuth2Client,
  contentUri: string,
): Promise<DownloadedImage> {
  const response = await auth.request<ArrayBuffer>({
    url: contentUri,
    method: "GET",
    responseType: "arraybuffer",
  });

  const headers = response.headers as
    | Headers
    | Record<string, string | string[] | undefined>
    | undefined;
  let contentTypeHeader: string | undefined;
  if (headers && typeof (headers as Headers).get === "function") {
    contentTypeHeader = (headers as Headers).get("content-type") ?? undefined;
  } else if (headers && typeof headers === "object") {
    const value = (headers as Record<string, string | string[] | undefined>)[
      "content-type"
    ];
    contentTypeHeader = Array.isArray(value) ? value[0] : value;
  }

  const contentType = contentTypeHeader
    ? contentTypeHeader.split(";")[0]!.trim().toLowerCase()
    : "application/octet-stream";

  const extension = CONTENT_TYPE_EXTENSION[contentType] ?? "bin";
  const data = response.data;
  const bytes = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data as ArrayBuffer);

  return { bytes, extension, contentType };
}
