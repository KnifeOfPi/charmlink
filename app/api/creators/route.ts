import { NextResponse } from "next/server";
import { getAllCreators } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const creators = await getAllCreators();
    return NextResponse.json(creators.map((c) => c.slug));
  } catch (err) {
    console.error("[creators:list] DB error", err);
    return NextResponse.json([], { status: 500 });
  }
}
