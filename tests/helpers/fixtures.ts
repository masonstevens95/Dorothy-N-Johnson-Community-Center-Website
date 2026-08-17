import sharp from "sharp";
import { ingestImage } from "@/lib/images";

/**
 * Image fixtures are generated rather than checked in: a binary in the repo
 * would be opaque, and generating them lets each test say exactly which
 * property it depends on (size, orientation, embedded GPS).
 */

/** sharp's Exif type only names the standard IFDs; GPS writes through fine. */
export type ExifInput = Parameters<ReturnType<typeof sharp>["withExif"]>[0];

/**
 * A noisy image. Flat colour compresses to almost nothing, which would make
 * any assertion about byte size meaningless.
 */
export function noise(width: number, height: number) {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 2654435761) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels } });
}

export async function makeJpeg(width = 900, height = 700): Promise<Buffer> {
  return noise(width, height).jpeg({ quality: 90 }).toBuffer();
}

/** A phone photo complete with camera make and GPS coordinates. */
export async function makeJpegWithGps(width = 2400, height = 1800): Promise<Buffer> {
  return noise(width, height)
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

export function asUpload(bytes: Buffer, name = "flyer.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

/** An image already through the ingest pipeline, as stored. */
export async function makeStoredImage(keyPrefix = "images") {
  return ingestImage(asUpload(await makeJpeg()), { keyPrefix });
}
