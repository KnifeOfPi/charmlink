import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { CreatorsConfig } from "../../../lib/types";

export async function GET() {
  const configPath = path.join(process.cwd(), "creators.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const config: CreatorsConfig = JSON.parse(raw);
  return NextResponse.json(Object.keys(config));
}
