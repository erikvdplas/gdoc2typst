import fs from "node:fs/promises";
import path from "node:path";

export interface AssetWriter {
  writeImage(objectId: string, extension: string, bytes: Buffer): Promise<string>;
}

/**
 * Writes image bytes under `assetsDir` and returns a path relative to `typstFile`.
 */
export function createAssetWriter(
  typstFile: string,
  assetsDir: string,
): AssetWriter {
  const used = new Map<string, string>();
  let counter = 0;

  return {
    async writeImage(objectId, extension, bytes) {
      const existing = used.get(objectId);
      if (existing) {
        return existing;
      }

      await fs.mkdir(assetsDir, { recursive: true });
      counter += 1;
      const safeId = objectId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
      const filename = `img-${String(counter).padStart(3, "0")}-${safeId}.${extension}`;
      const absolute = path.join(assetsDir, filename);
      await fs.writeFile(absolute, bytes);

      const relative = path
        .relative(path.dirname(typstFile), absolute)
        .split(path.sep)
        .join("/");
      used.set(objectId, relative);
      return relative;
    },
  };
}

/** In-memory asset writer for unit tests. */
export function createMemoryAssetWriter(): AssetWriter & {
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  let counter = 0;

  return {
    files,
    async writeImage(objectId, extension, bytes) {
      counter += 1;
      const name = `assets/img-${counter}-${objectId}.${extension}`;
      files.set(name, bytes);
      return name;
    },
  };
}
