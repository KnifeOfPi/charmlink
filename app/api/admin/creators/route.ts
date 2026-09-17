import { NextRequest, NextResponse } from "next/server";
import { getAllCreators, createCreator, createModel } from "../../../../lib/db";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const creators = await getAllCreators();
    return NextResponse.json(creators);
  } catch (err) {
    console.error("[admin:creators:get]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();

    // A creator with no model_id is invisible in the admin creators list: that
    // list is built by looping over models, so an unassigned site matches none
    // of them and renders nowhere while being live and serving visitors. The
    // list now surfaces such sites in an "Unassigned" group, but the better fix
    // is not to create them — so if no model was chosen, make one from the
    // name. That is what a person adding "Sarah Lloyd" means, and it leaves her
    // editable as a person from the moment she exists.
    if (!body.model_id) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json(
          { error: "name is required (it names the person this site belongs to)" },
          { status: 400 }
        );
      }
      const model = await createModel(name);
      body.model_id = model.id;
    }

    const creator = await createCreator(body);
    return NextResponse.json(creator, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
