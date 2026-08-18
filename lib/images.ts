import sharp, { type Sharp } from "sharp";
import { db } from "./db";
import { images, type Image } from "./db/schema";

/**
 * The single path from an uploaded file to stored bytes.
 *
 * Nothing else may write an image. Two independent reasons make this
 * load-bearing rather than tidy:
 *
 * 1. Vercel's Hobby tier *pauses the project* when storage, transfer, or
 *    image-transformation ceilings trip. An uncapped upload path is a way for
 *    the site to take itself offline by being used.
 * 2. Phone photos of flyers and garden beds routinely carry GPS coordinates in
 *    EXIF, and this site publishes them.
 *
 * Either reason alone would justify the pipeline. Together they mean the
 * constraints belong here, not in each caller.
 */

// --- Tunable caps ----------------------------------------------------------
// Deliberately left to be adjusted after real flyer photos have been measured
// rather than guessed at up front. Both are documented in the README.

/** Longest edge, in pixels, after downscaling. */
export const MAX_IMAGE_DIMENSION = 1600;

/** Largest accepted upload, before processing. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** WebP at this quality is visually indistinguishable for photographed flyers. */
export const OUTPUT_QUALITY = 82;

export const OUTPUT_CONTENT_TYPE = "image/webp";

/**
 * HEIC/HEIF is included because it is what an iPhone produces. Safari usually
 * transcodes to JPEG on upload, but not in every path, and a maintainer whose
 * photo is silently rejected at the bulletin board simply stops posting.
 */
export const ACCEPTED_INPUT_FORMATS = ["jpeg", "jpg", "png", "webp", "heif"] as const;

/**
 * Raised for uploads the pipeline refuses. Distinct from an unexpected
 * failure: these are the poster's problem to fix and must be shown to them,
 * because an event that silently publishes without its flyer is worse than one
 * that fails loudly while they are still standing at the board.
 */
export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageRejectedError";
  }
}

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  byteSize: number;
  contentType: string;
}

/**
 * Resizes, re-encodes, and strips metadata.
 *
 * `.rotate()` with no argument bakes the EXIF orientation into the pixels
 * before the metadata is dropped. Without it, stripping EXIF would leave
 * portrait phone photos displayed on their side — the metadata is the only
 * thing that knew which way was up.
 */
export async function processImage(
  input: Buffer | Uint8Array,
): Promise<ProcessedImage> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError(
      `That image is larger than ${formatBytes(MAX_UPLOAD_BYTES)}. Please choose a smaller photo.`,
    );
  }

  if (buffer.byteLength === 0) {
    throw new ImageRejectedError("That file is empty.");
  }

  let pipeline: Sharp;
  let format: string | undefined;

  try {
    pipeline = sharp(buffer, { limitInputPixels: 50_000_000 });
    format = (await pipeline.metadata()).format;
  } catch {
    // A file named .jpg whose contents are not an image lands here.
    throw new ImageRejectedError("That file is not an image we can read.");
  }

  if (!format || !(ACCEPTED_INPUT_FORMATS as readonly string[]).includes(format)) {
    throw new ImageRejectedError("That file is not an image we can read.");
  }

  const { data, info } = await pipeline
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      // A small image stays small. Upscaling would spend bytes inventing
      // detail that was never photographed.
      withoutEnlargement: true,
    })
    // No .withMetadata() and no .withExif(): sharp drops all metadata by
    // default, which is exactly what is wanted. GPS coordinates leave here.
    .webp({ quality: OUTPUT_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    byteSize: info.size,
    contentType: OUTPUT_CONTENT_TYPE,
  };
}

export interface StoredImage {
  url: string;
  pathname: string;
}

/**
 * Writes processed bytes to blob storage, or to the local filesystem when no
 * blob token is configured so development works without cloud credentials.
 */
export async function storeImage(
  processed: ProcessedImage,
  keyPrefix = "images",
): Promise<StoredImage> {
  const pathname = `${keyPrefix}/${crypto.randomUUID()}.webp`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, processed.data, {
      access: "public",
      contentType: processed.contentType,
      // The pathname already carries a UUID; a second random suffix would only
      // make the stored key impossible to correlate with the database row.
      addRandomSuffix: false,
    });

    return { url: blob.url, pathname: blob.pathname };
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");

  const filePath = join(process.cwd(), "public", "uploads", pathname);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, processed.data);

  return { url: `/uploads/${pathname}`, pathname };
}

export interface IngestOptions {
  altText?: string | null;
  keyPrefix?: string;
}

/**
 * Validate, process, store, record — the whole path, in one call.
 *
 * Callers get an image row or an error. There is deliberately no way to store
 * bytes without also processing them, because "remember to call processImage
 * first" is exactly the kind of instruction that holds until the day someone
 * adds a route in a hurry.
 */
export async function ingestImage(
  file: File | Blob,
  { altText = null, keyPrefix }: IngestOptions = {},
): Promise<Image> {
  // Checked before reading the body into memory: the point of a byte cap is
  // not to buffer the payload first.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError(
      `That image is larger than ${formatBytes(MAX_UPLOAD_BYTES)}. Please choose a smaller photo.`,
    );
  }

  const processed = await processImage(Buffer.from(await file.arrayBuffer()));
  const stored = await storeImage(processed, keyPrefix);

  const [record] = await db
    .insert(images)
    .values({
      url: stored.url,
      pathname: stored.pathname,
      width: processed.width,
      height: processed.height,
      byteSize: processed.byteSize,
      contentType: processed.contentType,
      altText,
    })
    .returning();

  return record;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
