import type { docs_v1 } from "@googleapis/docs";
import type { ConvertContext } from "../context.js";
import { escapeTypst, escapeTypstString } from "../escape.js";

export function convertInlineObject(
  element: docs_v1.Schema$ParagraphElement,
  ctx: ConvertContext,
): string {
  const inline = element.inlineObjectElement;
  const objectId = inline?.inlineObjectId;
  if (!objectId) {
    return "";
  }
  return `__IMAGE__:${objectId}`;
}

export async function resolveImagePlaceholders(
  markup: string,
  ctx: ConvertContext,
): Promise<string> {
  const pattern = /__IMAGE__:([^\s\n]+)/g;
  const ids = [...markup.matchAll(pattern)].map((m) => m[1]!);
  if (ids.length === 0) {
    return markup;
  }

  const replacements = new Map<string, string>();
  for (const objectId of new Set(ids)) {
    replacements.set(objectId, await renderImage(objectId, ctx));
  }

  return markup.replace(pattern, (_match, objectId: string) => {
    return replacements.get(objectId) ?? "";
  });
}

async function renderImage(
  objectId: string,
  ctx: ConvertContext,
): Promise<string> {
  const inline = ctx.inlineObjects[objectId];
  const positioned = ctx.positionedObjects[objectId];
  const embedded =
    inline?.inlineObjectProperties?.embeddedObject ??
    positioned?.positionedObjectProperties?.embeddedObject;

  if (!embedded) {
    ctx.warn("image", `Unknown image object: ${objectId}`);
    return `/* missing image: ${objectId} */`;
  }

  const contentUri = embedded.imageProperties?.contentUri;
  if (!contentUri) {
    ctx.warn(
      "drawing",
      `Embedded object ${objectId} has no downloadable image (drawings are not exported).`,
    );
    return `// unsupported: drawing ${objectId}`;
  }

  if (!ctx.downloadImage) {
    ctx.warn("image", `No image downloader available for ${objectId}`);
    return `/* image omitted: ${objectId} */`;
  }

  try {
    const { bytes, extension } = await ctx.downloadImage(contentUri);
    const relPath = await ctx.assets.writeImage(
      objectId,
      extension,
      bytes,
      ctx.moduleFile,
    );
    const captionParts = [embedded.title, embedded.description]
      .filter((part): part is string => Boolean(part && part.trim()))
      .map((part) => escapeTypst(part.trim()));
    const caption = captionParts.join(" — ");

    if (caption) {
      return `#figure(image("${escapeTypstString(relPath)}"), caption: [${caption}])`;
    }
    return `#image("${escapeTypstString(relPath)}")`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.warn("image", `Failed to download image ${objectId}: ${message}`);
    return `/* failed image: ${objectId} */`;
  }
}
