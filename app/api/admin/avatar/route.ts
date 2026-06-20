import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

// Client-direct upload token endpoint.
//
// The browser uploads the file bytes STRAIGHT to Vercel Blob (not through this
// serverless function), which sidesteps Vercel's ~4.5 MB function request-body
// cap that previously 413'd any avatar over ~4 MB. This route only mints a
// short-lived, scoped upload token and (optionally) records completion.
//
// HEIC/HEIF handling: because the raw bytes go straight to Blob, the old
// server-side sharp HEIC→JPEG conversion no longer sits in the upload path.
// We keep accepting HEIC/HEIF and store them as-is — modern Safari/iOS (the
// devices that produce HEIC) render them directly from the Blob URL, and the
// admin can always paste a URL or re-export to JPEG if a target browser can't
// display it. This keeps the upload path simple and avoids reintroducing the
// body-limit problem. (sharp is intentionally no longer used here.)

// 100 MB cap, enforced by Blob during the client upload via the signed token.
// Client-direct upload has no serverless body limit (Blob supports up to 5 TB);
// avatars get downscaled on render anyway, so a large source file is fine.
const MAX_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

// The browser sends the admin key in a custom header on the handleUpload
// request (via the `headers` option of @vercel/blob/client `upload()`), since
// the SDK controls the request body. We accept either the custom header or the
// standard Authorization header for robustness.
function isAuthorized(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const expected = `Bearer ${adminKey}`;
  const authHeader = request.headers.get("authorization");
  const customHeader = request.headers.get("x-admin-key");
  return authHeader === expected || customHeader === adminKey;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Enforce auth BEFORE generating any upload token. An unauthenticated caller
  // must never be able to mint a Blob write token.
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => {
        // Re-check auth here as defense in depth; this callback only runs for
        // the token-generation event, and we've already verified above.
        if (!isAuthorized(request)) {
          throw new Error("Unauthorized");
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
          cacheControlMaxAge: 60 * 60 * 24 * 30, // 30 days
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // No persistence needed here — the client sets form.avatar_url from the
        // returned blob URL and saves it via the creator PUT endpoint.
        console.log("[admin:avatar:upload] completed", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unauthor/i.test(message)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[admin:avatar:upload] handleUpload failed", err);
    const isAuthIssue = /token|forbidden|BLOB_READ_WRITE_TOKEN/i.test(message);
    return NextResponse.json(
      {
        error: isAuthIssue
          ? "Vercel Blob storage is not configured. Enable Blob on the project and ensure BLOB_READ_WRITE_TOKEN is set."
          : "Failed to upload to Vercel Blob storage.",
        details: message,
      },
      { status: 400 },
    );
  }
}
