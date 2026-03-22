import { NextResponse } from "next/server";
import { THEME_PRESETS } from "../../../../lib/themes";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    THEME_PRESETS.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      preview: t.preview,
    }))
  );
}
