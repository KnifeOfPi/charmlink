import { NextRequest, NextResponse } from "next/server";
import { getAllCreators } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Admin-only route: lists every creator slug. Must not be public.
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (adminKey) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${adminKey}`) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const creators = await getAllCreators();
    return NextResponse.json(creators.map((c) => c.slug));
  } catch (err) {
    console.error("[creators:list] DB error", err);
    return NextResponse.json([], { status: 500 });
  }
}
