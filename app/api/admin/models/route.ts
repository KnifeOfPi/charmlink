import { NextRequest, NextResponse } from "next/server";
import {
  getModelsWithSites,
  createModel,
  updateModel,
  deleteModel,
  setCreatorModel,
  getModelSlugs,
  MODEL_OWNED_FIELDS,
} from "../../../../lib/db";
import { invalidateAvatarCache } from "../../../../lib/avatar-rotation";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  return request.headers.get("authorization") === `Bearer ${adminKey}`;
}

/** Every site under the model shares one photo pool, so a change to the model
 *  has to clear all of their rotation caches, not just one. */
async function bustModelCache(modelId: string): Promise<void> {
  try {
    for (const slug of await getModelSlugs(modelId)) invalidateAvatarCache(slug);
  } catch {
    // Best-effort; the TTL bounds staleness.
  }
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getModelsWithSites());
  } catch (err) {
    console.error("[admin:models:get]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { name } = (await request.json()) as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    return NextResponse.json(await createModel(name.trim()), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown> & { id?: string };

    // Re-parenting a site: {creatorId, modelId}. modelId null detaches it, and
    // the site falls back to its own columns rather than losing its identity.
    if (typeof body.creatorId === "string") {
      const target = body.modelId === null ? null : String(body.modelId);
      await setCreatorModel(body.creatorId, target);
      if (target) await bustModelCache(target);
      return NextResponse.json({ ok: true });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Whitelist: only model-owned fields are writable here.
    const patch: Record<string, unknown> = { id: String(body.id) };
    for (const k of MODEL_OWNED_FIELDS) if (k in body) patch[k] = body[k];

    const updated = await updateModel(patch as { id: string });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await bustModelCache(updated.id);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = (await request.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await bustModelCache(id);
    const ok = await deleteModel(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin:models:delete]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
