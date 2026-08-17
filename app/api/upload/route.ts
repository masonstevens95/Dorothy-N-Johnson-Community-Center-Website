import { NextResponse } from "next/server";
import { UnauthorizedError, requireAdmin } from "@/lib/auth-guard";
import { ImageRejectedError, ingestImage } from "@/lib/images";
import { readOptionalText } from "@/app/admin/form-helpers";

/**
 * The maintainer's upload path. Behind the write gate (R13).
 *
 * The public submission form does NOT post here — it ingests through the same
 * lib/images.ts pipeline inside its own rate-limited action, so an untrusted
 * caller cannot reach an authenticated route and both paths enforce identical
 * caps. Divergence between the two would turn the public form into a way to
 * bypass the limits that keep the deployment alive.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    throw error;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image was attached." }, { status: 400 });
  }

  try {
    const image = await ingestImage(file, {
      altText: readOptionalText(formData, "altText"),
    });

    return NextResponse.json({
      id: image.id,
      url: image.url,
      width: image.width,
      height: image.height,
    });
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      // The poster is standing at the bulletin board. They need to know now.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

// sharp needs the Node runtime; it does not run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
