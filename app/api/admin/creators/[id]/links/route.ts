import { NextRequest, NextResponse } from "next/server";
import { getCreatorLinks, createLink, updateLink, deleteLink } from "../../../../../../lib/db";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: creatorId } = await params;
  try {
    const links = await getCreatorLinks(creatorId);
    return NextResponse.json(links);
  } catch (err) {
    console.error("[admin:links:get]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: creatorId } = await params;
  try {
    const body = await request.json();
    const link = await createLink({ ...body, creator_id: creatorId });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // params.id is creator_id here, but link id comes from body
  const { id: creatorId } = await params;
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Link id required" }, { status: 400 });
    }
    const link = await updateLink(body);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(link);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error("[admin:links:put] creator:", creatorId, err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: creatorId } = await params;
  try {
    const { linkId } = await request.json() as { linkId: string };
    if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });
    const deleted = await deleteLink(linkId);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.log("[admin:links:delete] creator:", creatorId, "link:", linkId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin:links:delete]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
