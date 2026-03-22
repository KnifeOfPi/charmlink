import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const result: Record<string, unknown> = {
    hasDbUrl: !!dbUrl,
    dbUrlLength: dbUrl?.length ?? 0,
    dbUrlPrefix: dbUrl?.substring(0, 25) ?? "NOT SET",
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  };

  if (!dbUrl) {
    return NextResponse.json({ ...result, error: "DATABASE_URL not set" }, { status: 500 });
  }

  try {
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    const res = await client.query("SELECT count(*) as cnt FROM charmlink_creators");
    client.release();
    await pool.end();
    result.dbConnected = true;
    result.creatorCount = res.rows[0]?.cnt;
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.dbConnected = false;
    result.dbError = msg;
    return NextResponse.json(result, { status: 500 });
  }
}
