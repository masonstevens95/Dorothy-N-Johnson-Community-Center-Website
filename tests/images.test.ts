import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ACCEPTED_INPUT_FORMATS,
  ImageRejectedError,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  ingestImage,
  processImage,
} from "@/lib/images";
import { images } from "@/lib/db/schema";
import {
  closeTestDatabase,
  db,
  setupTestDatabase,
  truncateAll,
} from "./helpers/db";

beforeAll(async () => {
  await setupTestDatabase();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDatabase();
});

type ExifInput = Parameters<ReturnType<typeof sharp>["withExif"]>[0];

/** A noisy image, because flat colour compresses to almost nothing. */
function noise(width: number, height: number) {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 2654435761) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels } });
}

async function jpegWithGps(width = 2400, height = 1800): Promise<Buffer> {
  return noise(width, height)
    // sharp's Exif type only names the standard IFDs; GPS is written through
    // just fine, which is precisely why the pipeline has to remove it.
    .withExif({
      IFD0: { Make: "TestPhone", Model: "TestCam" },
      GPS: {
        GPSLatitudeRef: "N",
        GPSLatitude: "42/1 19/1 3/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "85/1 40/1 12/1",
      },
    } as ExifInput)
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("processImage", () => {
  it("downscales a large photo to within the dimension cap", async () => {
    const original = await noise(3200, 2400).jpeg().toBuffer();
    const processed = await processImage(original);

    expect(Math.max(processed.width, processed.height)).toBe(MAX_IMAGE_DIMENSION);
    // Aspect ratio is preserved — 4:3 in, 4:3 out.
    expect(processed.width / processed.height).toBeCloseTo(3200 / 2400, 2);
    expect(processed.contentType).toBe("image/webp");
  });

  it("strips EXIF, including GPS coordinates", async () => {
    const original = await jpegWithGps();

    // The fixture really does carry the coordinates we expect to lose.
    const before = await sharp(original).metadata();
    expect(before.exif).toBeDefined();

    const processed = await processImage(original);
    const after = await sharp(processed.data).metadata();

    expect(after.exif).toBeUndefined();
    // Belt and braces: no EXIF marker anywhere in the stored bytes.
    expect(processed.data.includes(Buffer.from("GPS"))).toBe(false);
    expect(processed.data.includes(Buffer.from("TestPhone"))).toBe(false);
  });

  it("re-encodes an image already under the cap without upscaling it", async () => {
    const original = await noise(400, 300).png().toBuffer();
    const processed = await processImage(original);

    expect(processed.width).toBe(400);
    expect(processed.height).toBe(300);
    // Re-encoded regardless — the format is normalized even when the
    // dimensions are already fine.
    expect(processed.contentType).toBe("image/webp");
    expect((await sharp(processed.data).metadata()).format).toBe("webp");
  });

  it("keeps a portrait phone photo upright after metadata is stripped", async () => {
    // Orientation 6 means "rotate 90° clockwise to display". The pixels are
    // landscape; only the EXIF tag knows it should be shown portrait. Stripping
    // metadata without baking the rotation in would leave it on its side.
    //
    // withMetadata({ orientation }) rather than withExif: sharp manages the
    // orientation tag separately, and setting it through withExif silently
    // produces an image with orientation 1.
    const sideways = await noise(1200, 900)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    expect((await sharp(sideways).metadata()).orientation).toBe(6);

    const processed = await processImage(sideways);

    expect(processed.height).toBeGreaterThan(processed.width);
    expect((await sharp(processed.data).metadata()).exif).toBeUndefined();
  });

  it("rejects a payload over the byte cap", async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1);

    await expect(processImage(oversized)).rejects.toThrow(ImageRejectedError);
    await expect(processImage(oversized)).rejects.toThrow(/larger than/i);
  });

  it("rejects a non-image file", async () => {
    const notAnImage = Buffer.from("This is a PDF, honest.", "utf8");

    await expect(processImage(notAnImage)).rejects.toThrow(ImageRejectedError);
  });

  it("rejects a file whose contents do not match its image extension", async () => {
    // The name is irrelevant here — the pipeline reads the bytes, so a .jpg
    // full of zip data is refused on content rather than trusted on filename.
    const zipMagic = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(512, 7),
    ]);

    await expect(processImage(zipMagic)).rejects.toThrow(ImageRejectedError);
  });

  it("rejects an empty file", async () => {
    await expect(processImage(Buffer.alloc(0))).rejects.toThrow(ImageRejectedError);
  });

  it("accepts every input format the pipeline advertises", async () => {
    const jpeg = await noise(800, 600).jpeg().toBuffer();
    const png = await noise(800, 600).png().toBuffer();
    const webp = await noise(800, 600).webp().toBuffer();

    for (const buffer of [jpeg, png, webp]) {
      const processed = await processImage(buffer);
      expect(processed.byteSize).toBeGreaterThan(0);
    }

    expect(ACCEPTED_INPUT_FORMATS).toContain("heif");
  });
});

describe("ingestImage", () => {
  it("stores processed bytes and records their true dimensions", async () => {
    const original = await jpegWithGps(2400, 1800);
    const file = new File([new Uint8Array(original)], "flyer.jpg", {
      type: "image/jpeg",
    });

    const record = await ingestImage(file, { altText: "Flyer for the potluck" });

    expect(Math.max(record.width, record.height)).toBe(MAX_IMAGE_DIMENSION);
    expect(record.contentType).toBe("image/webp");
    expect(record.altText).toBe("Flyer for the potluck");
    expect(record.byteSize).toBeGreaterThan(0);
    expect(record.pathname).toMatch(/\.webp$/);

    const stored = await db.select().from(images);
    expect(stored).toHaveLength(1);

    // The recorded size is the *processed* size, not the original upload.
    expect(stored[0].byteSize).toBeLessThan(original.byteLength);
  });

  it("writes no database row when the image is rejected", async () => {
    const notAnImage = new File([new Uint8Array(Buffer.from("nope"))], "flyer.jpg", {
      type: "image/jpeg",
    });

    await expect(ingestImage(notAnImage)).rejects.toThrow(ImageRejectedError);

    // A rejected upload must not leave an orphaned row pointing at bytes that
    // were never stored.
    const stored = await db.select().from(images);
    expect(stored).toHaveLength(0);
  });

  it("rejects an oversized file before reading its body", async () => {
    const oversized = new File(
      [new Uint8Array(Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 3))],
      "huge.jpg",
      { type: "image/jpeg" },
    );

    await expect(ingestImage(oversized)).rejects.toThrow(/larger than/i);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it("processes an untrusted submission identically to a maintainer upload", async () => {
    // U8's public form and the maintainer's route share this function, so the
    // caps and EXIF stripping cannot diverge between trusted and untrusted
    // callers.
    const original = await jpegWithGps(2400, 1800);

    const maintainerUpload = await ingestImage(
      new File([new Uint8Array(original)], "flyer.jpg", { type: "image/jpeg" }),
    );
    const publicSubmission = await ingestImage(
      new File([new Uint8Array(original)], "flyer.jpg", { type: "image/jpeg" }),
      { keyPrefix: "submissions" },
    );

    expect(publicSubmission.width).toBe(maintainerUpload.width);
    expect(publicSubmission.height).toBe(maintainerUpload.height);
    expect(publicSubmission.contentType).toBe(maintainerUpload.contentType);
    expect(publicSubmission.byteSize).toBe(maintainerUpload.byteSize);
  });
});
