#!/usr/bin/env tsx
/**
 * check-event-types.ts — does the database accept every event the code emits?
 *
 * Run in CI, or before/after any deploy that touches event types:
 *
 *     npm run check:event-types
 *
 * WHY THIS EXISTS. RecordEventInput in lib/db.ts declares the event union, and
 * charmlink_events_type_check enforces it in Postgres. Nothing kept the two in
 * step, and recordEvent() swallows the rejection, so a value present in one and
 * absent from the other fails silently at 23514 and the metric simply reads
 * zero. Twice now that zero was reported as a business fact:
 *
 *   * 'escape_fallback' — ~697 beacons rejected from 2026-08-28 until someone
 *     widened the constraint by hand, with no migration to match.
 *   * 'autoredirect'    — rejected for the entire life of the feature. Three
 *     live redirect domains read as zero-traffic while OnlyFans recorded 152
 *     clicks against the same links, and were reported as dead.
 *
 * Exits non-zero when the two disagree, so CI fails instead of production
 * quietly undercounting.
 *
 * Requires DATABASE_URL (or: export DATABASE_URL=$(cat ~/.openclaw/charmasutra-db)).
 */

import { Pool } from "pg";
import fs from "fs";
import path from "path";

/** Parse the union off RecordEventInput.type without importing lib/db (which
 *  would open a pool and pull in the whole app). Source of truth stays the one
 *  declaration; this only reads it. */
function unionFromSource(): string[] {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "db.ts"),
    "utf-8"
  );
  const m = src.match(/interface RecordEventInput\s*\{[\s\S]*?\btype:\s*([^;]+);/);
  if (!m) throw new Error("Could not find RecordEventInput.type in lib/db.ts");
  const values = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (values.length === 0) throw new Error(`Parsed no values from: ${m[1]}`);
  return values.sort();
}

async function constraintFromDb(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'charmlink_events'::regclass
        AND contype = 'c'
        AND conname = 'charmlink_events_type_check'`
  );
  if (rows.length === 0) {
    throw new Error(
      "charmlink_events_type_check not found — the column is unconstrained, so ANY value inserts."
    );
  }
  return [...rows[0].def.matchAll(/'([^']+)'::character varying/g)]
    .map((x) => x[1])
    .sort();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    const code = unionFromSource();
    const db = await constraintFromDb(pool);

    console.log(`  code (RecordEventInput): ${code.join(", ")}`);
    console.log(`  db   (check constraint): ${db.join(", ")}`);

    // Only one direction actually drops data: a value the code emits that the
    // database rejects. The reverse is dead capacity, worth reporting but not
    // worth failing a build over.
    const rejected = code.filter((t) => !db.includes(t));
    const unused = db.filter((t) => !code.includes(t));

    if (unused.length > 0) {
      console.log(`\n⚠️  allowed but never emitted: ${unused.join(", ")}`);
    }

    if (rejected.length > 0) {
      console.error(
        `\n❌ THE DATABASE REJECTS: ${rejected.join(", ")}` +
          `\n   Every one of these events is being dropped at 23514 and swallowed` +
          `\n   by recordEvent's catch. The affected metric reads zero, which is` +
          `\n   indistinguishable from no traffic.` +
          `\n\n   Fix with a migration widening charmlink_events_type_check.`
      );
      process.exit(1);
    }

    // Recent drops are the other half of the picture: the constraint can agree
    // with the code while writes still fail (pool exhaustion, type errors).
    const { rows: fails } = await pool.query<{ n: string; kinds: string }>(
      `SELECT COUNT(*) AS n,
              COALESCE(string_agg(DISTINCT event_type || ':' || COALESCE(error_code,'?'), ', '), '') AS kinds
         FROM charmlink_event_write_failures
        WHERE ts >= now() - interval '24 hours'`
    );
    const n = parseInt(fails[0]?.n ?? "0");
    if (n > 0) {
      console.log(`\n⚠️  ${n} event write(s) failed in the last 24h: ${fails[0].kinds}`);
      console.log("   charmlink_events is undercounting by at least that much.");
    } else {
      console.log("\n✅ no event write failures logged in the last 24h");
    }

    console.log("\n✅ code and database agree on event types");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
