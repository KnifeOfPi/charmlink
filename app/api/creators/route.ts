import { NextResponse } from "next/server";
import { getAllCreators } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const creators = await getAllCreators();
    return NextResponse.json(creators.map((c) => c.slug));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[creators:list] DB error", msg);
    return NextResponse.json({ error: msg, creators: [] }, { status: 500 });
  }
}
