import { NextRequest, NextResponse } from "next/server";
import {
  getCreatorAvatars,
  createCreatorAvatar,
  updateCreatorAvatar,
  deleteCreatorAvatar,
  getAvatarStats,
  getCreatorById,
} from "../../../../../../lib/db";
import { invalidateAvatarCache } from "../../../../../../lib/avatar-rotation";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  return request.headers.get("authorization") === `Bearer ${adminKey}`;
}

/** Drop the rotation cache for this creator so admin edits show up on the next
 *  page render instead of up to 5 minutes later. */
async function bustCache(creatorId: string): Promise<void> {
  try {
    const creator = await getCreatorById(creatorId);
    if (creator) invalidateAvatarCache(creator.slug);
  } catch {
    // Cache invalidation is best-effort; the TTL bounds the staleness anyway.
  }
}

/** Avatars plus their measured performance, which is what the manager renders. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: creatorId } = await params;
  const period = (new URL(request.url).searchParams.get("period") || "all") as
    | "today"
    | "7d"
    | "30d"
    | "all";
  try {
    const [avatars, stats] = await Promise.all([
      getCreatorAvatars(creatorId),
      getAvatarStats(creatorId, period),
    ]);
    const byId = new Map(stats.map((s) => [s.avatar_id, s]));
    return NextResponse.json(
      avatars.map((a) => ({
        ...a,
        impressions: byId.get(a.id)?.impressions ?? 0,
        premiumClicks: byId.get(a.id)?.premiumClicks ?? 0,
        conversionRate: byId.get(a.id)?.conversionRate ?? 0,
      }))
    );
  } catch (err) {
    console.error("[admin:avatars:get]", err);
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
    const { url } = (await request.json()) as { url?: string };
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "A valid image URL is required" }, { status: 400 });
    }
    const avatar = await createCreatorAvatar(creatorId, url);
    await bustCache(creatorId);
    return NextResponse.json(avatar, { status: 201 });
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
  const { id: creatorId } = await params;
  try {
    const body = (await request.json()) as {
      avatarId?: string;
      is_active?: boolean;
      is_pinned?: boolean;
      sort_order?: number;
    };
    if (!body.avatarId) {
      return NextResponse.json({ error: "avatarId required" }, { status: 400 });
    }
    const updated = await updateCreatorAvatar(body.avatarId, {
      is_active: body.is_active,
      is_pinned: body.is_pinned,
      sort_order: body.sort_order,
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await bustCache(creatorId);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
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
    const { avatarId } = (await request.json()) as { avatarId?: string };
    if (!avatarId) {
      return NextResponse.json({ error: "avatarId required" }, { status: 400 });
    }
    const deleted = await deleteCreatorAvatar(avatarId);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await bustCache(creatorId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin:avatars:delete]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
