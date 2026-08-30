import { NextRequest, NextResponse } from "next/server";
import { getEscapeExperimentStats } from "../../../../lib/db";
import {
  ESCAPE_EXPERIMENT_ENABLED,
  ESCAPE_EXPERIMENT_SLUG,
  ESCAPE_EXPERIMENT_START,
} from "../../../../lib/escape-experiment";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  return request.headers.get("authorization") === `Bearer ${adminKey}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { arms, daily } = await getEscapeExperimentStats(
      ESCAPE_EXPERIMENT_SLUG,
      ESCAPE_EXPERIMENT_START
    );
    return NextResponse.json({
      slug: ESCAPE_EXPERIMENT_SLUG,
      start: ESCAPE_EXPERIMENT_START,
      enabled: ESCAPE_EXPERIMENT_ENABLED,
      arms,
      daily,
    });
  } catch (err) {
    console.error("[analytics:experiment] DB error", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
