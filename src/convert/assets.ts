import fs from "node:fs/promises";
import path from "node:path";

export interface AssetWriter {
  writeImage(
    objectId: string,
    extension: string,
    bytes: Buffer,
    fromFile: string,
  ): Promise<string>;
}

/**
 * Writes image bytes under `assetsDir` and returns a path relative to `fromFile`.
 */
export function createAssetWriter(assetsDir: string): AssetWriter {
  const written = new Map<string, string>();
  let counter = 0;

  return {
    async writeImage(objectId, extension, bytes, fromFile) {
      let absolute = written.get(objectId);
      if (!absolute) {
        await fs.mkdir(assetsDir, { recursive: true });
        counter += 1;
        const safeId = objectId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
        const filename = `img-${String(counter).padStart(3, "0")}-${safeId}.${extension}`;
        absolute = path.join(assetsDir, filename);
        await fs.writeFile(absolute, bytes);
        written.set(objectId, absolute);
      }

      return path
        .relative(path.dirname(fromFile), absolute)
        .split(path.sep)
        .join("/");
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
    async writeImage(objectId, extension, bytes, _fromFile) {
      counter += 1;
      const name = `assets/img-${counter}-${objectId}.${extension}`;
      files.set(name, bytes);
      return name;
    },
  };
}
