import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";

export const runtime = "nodejs";

// 10 MB raw upload cap. iPhone HEIC screenshots routinely run 3-6 MB; PNG
// from desktop tools can hit 8 MB; we give headroom but stop short of the
// Vercel Functions request-body limit (which is 4.5 MB for the Edge runtime
// and 10 MB+ for the Node runtime depending on plan).
const MAX_SIZE = 10 * 1024 * 1024;

// Accept iPhone-native HEIC/HEIF alongside the usual web formats. We always
// re-encode HEIC/HEIF to JPEG server-side because no browser renders them
// without help.
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

function slugifyForPath(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "unknown";
}

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not parse upload (multipart form-data expected).",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const rawSlug = (formData.get("creatorSlug") as string | null) ?? "unknown";
  const creatorSlug = slugifyForPath(rawSlug);

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type "${file.type || "unknown"}". Allowed: JPEG, PNG, WebP, GIF, HEIC, HEIF.`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return NextResponse.json(
      { error: `File too large (${mb} MB). Maximum size is 10 MB.` },
      { status: 400 },
    );
  }

  // Materialize once; we may need to re-encode (HEIC → JPEG).
  let inputBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    inputBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not read uploaded file bytes.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  let uploadBuffer: Buffer = inputBuffer;
  let uploadContentType: string = file.type;

  if (HEIC_TYPES.has(file.type)) {
    try {
      uploadBuffer = await sharp(inputBuffer)
        .rotate() // honor EXIF orientation before stripping
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      uploadContentType = "image/jpeg";
    } catch (err) {
      console.error("[admin:avatar:upload] HEIC→JPEG failed", err);
      return NextResponse.json(
        {
          error:
            "Could not convert HEIC/HEIF to JPEG. Try exporting to JPEG from the Photos app and re-uploading.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 },
      );
    }
  }

  // Final sanity: post-decode size cap. Sharp output is almost always
  // smaller than HEIC input, but guard against pathological cases.
  if (uploadBuffer.byteLength > MAX_SIZE) {
    return NextResponse.json(
      { error: "Processed image exceeded 10 MB after conversion." },
      { status: 400 },
    );
  }

  const ext = extensionFor(uploadContentType);
  // Blob's addRandomSuffix appends a suffix to the basename; we still pin
  // a creator-scoped prefix so the admin can eyeball ownership.
  const pathname = `avatars/${creatorSlug}/avatar.${ext}`;

  try {
    const blob = await put(pathname, uploadBuffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: uploadContentType,
      cacheControlMaxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[admin:avatar:upload] Blob put failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const isAuthIssue = /token|unauthor|forbidden|BLOB_READ_WRITE_TOKEN/i.test(message);
    return NextResponse.json(
      {
        error: isAuthIssue
          ? "Vercel Blob storage is not configured. Enable Blob on the project and ensure BLOB_READ_WRITE_TOKEN is set."
          : "Failed to upload to Vercel Blob storage.",
        details: message,
      },
      { status: 502 },
    );
  }
}
