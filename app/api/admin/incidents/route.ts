import { NextRequest, NextResponse } from "next/server";
import {
  createIncident,
  deleteIncident,
  INCIDENT_KINDS,
  INCIDENT_PLATFORMS,
  listIncidents,
  resolveIncident,
  type IncidentInput,
} from "../../../../lib/db";

export const runtime = "nodejs";

// Platform enforcement log (charmlink_incidents) — see the migration
// 20261007000000_incidents.sql for why it exists.
//
//   GET    /api/admin/incidents                      → list (newest first)
//   POST   /api/admin/incidents  {IncidentInput}     → create
//   PATCH  /api/admin/incidents  {id, resolution}    → mark resolved
//   DELETE /api/admin/incidents  {id}                → delete (mis-entries)

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  return request.headers.get("authorization") === `Bearer ${adminKey}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await listIncidents());
  } catch (err) {
    console.error("[admin/incidents] list failed", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Partial<IncidentInput>;
  try {
    body = (await request.json()) as Partial<IncidentInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.occurred_at || Number.isNaN(Date.parse(body.occurred_at))) {
    return NextResponse.json({ error: "occurred_at must be a date" }, { status: 400 });
  }
  if (!INCIDENT_PLATFORMS.includes(body.platform as (typeof INCIDENT_PLATFORMS)[number])) {
    return NextResponse.json({ error: `platform must be one of ${INCIDENT_PLATFORMS.join(", ")}` }, { status: 400 });
  }
  if (!INCIDENT_KINDS.includes(body.kind as (typeof INCIDENT_KINDS)[number])) {
    return NextResponse.json({ error: `kind must be one of ${INCIDENT_KINDS.join(", ")}` }, { status: 400 });
  }
  if (body.creator_id && !UUID_RE.test(body.creator_id)) {
    return NextResponse.json({ error: "creator_id must be a UUID" }, { status: 400 });
  }
  try {
    const row = await createIncident({
      ...(body as IncidentInput),
      occurred_at: new Date(body.occurred_at).toISOString(),
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[admin/incidents] create failed", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; resolution?: string };
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const ok = await resolveIncident(body.id, body.resolution ?? null);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[admin/incidents] resolve failed", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const ok = await deleteIncident(body.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[admin/incidents] delete failed", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
