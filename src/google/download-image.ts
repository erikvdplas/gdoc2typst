import type { OAuth2Client } from "google-auth-library";

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const MAX_REDIRECTS = 5;

export interface DownloadedImage {
  bytes: Buffer;
  extension: string;
  contentType: string;
}

/**
 * Download a Docs `contentUri`.
 *
 * That URL is already bound to the account that called `documents.get`.
 * Sending it through `OAuth2Client.request` attaches `Authorization`, which
 * `googleusercontent.com` rejects (typically HTTP 400). Fetch it plainly first.
 * If the host still requires a bearer token, retry and keep the header across
 * redirects — `fetch` strips `Authorization` on cross-origin redirects.
 */
export async function downloadImage(
  auth: OAuth2Client,
  contentUri: string,
): Promise<DownloadedImage> {
  const plain = await fetch(contentUri, { redirect: "follow" });
  const plainImage = await readImage(plain);
  if (plainImage) {
    return plainImage;
  }

  const token = (await auth.getAccessToken()).token;
  if (!token) {
    throw new Error(
      `Image download failed (${plain.status} ${plain.statusText}) and no access token is available.`,
    );
  }

  const authed = await fetchFollowingAuth(contentUri, token);
  const authedImage = await readImage(authed);
  if (authedImage) {
    return authedImage;
  }

  throw new Error(
    `Image download failed (${authed.status} ${contentTypeOf(authed) ?? "no content type"}).`,
  );
}

async function fetchFollowingAuth(
  startUrl: string,
  token: string,
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status < 300 || response.status >= 400) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location) {
      return response;
    }
    current = new URL(location, current).toString();
  }
  throw new Error("Image download failed: too many redirects.");
}

async function readImage(response: Response): Promise<DownloadedImage | null> {
  if (!response.ok) {
    return null;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const headerType = contentTypeOf(response);
  const sniffed = sniffImage(bytes);
  if (!headerType?.startsWith("image/") && !sniffed) {
    return null;
  }
  const contentType = headerType?.startsWith("image/")
    ? headerType
    : sniffed!.contentType;
  const extension =
    CONTENT_TYPE_EXTENSION[contentType] ?? sniffed?.extension ?? "bin";
  return { bytes, extension, contentType };
}

function contentTypeOf(response: Response): string | undefined {
  const raw = response.headers.get("content-type");
  return raw?.split(";")[0]?.trim().toLowerCase();
}

function sniffImage(
  bytes: Buffer,
): { contentType: string; extension: string } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 6) {
    const gif = bytes.subarray(0, 6).toString("ascii");
    if (gif === "GIF87a" || gif === "GIF89a") {
      return { contentType: "image/gif", extension: "gif" };
    }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  const head = bytes.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return { contentType: "image/svg+xml", extension: "svg" };
  }
  return null;
}
