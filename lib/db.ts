import { Pool, PoolClient } from "pg";
import { AnalyticsSummary, DeviceType } from "./types";

// ── Connection Pool ───────────────────────────────────────────────────────────

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client: PoolClient = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// ── DB Types ──────────────────────────────────────────────────────────────────

export interface DBCreator {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  avatar_url: string;
  custom_domain: string | null;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBLink {
  id: string;
  creator_id: string;
  label: string;
  url: string;
  icon: string;
  link_type: "social" | "premium";
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateCreatorInput {
  slug: string;
  name: string;
  tagline?: string;
  avatar_url?: string;
  custom_domain?: string | null;
  theme_bg?: string;
  theme_accent?: string;
  theme_text?: string;
  is_active?: boolean;
}

export interface UpdateCreatorInput extends Partial<CreateCreatorInput> {
  id: string;
}

export interface CreateLinkInput {
  creator_id: string;
  label: string;
  url: string;
  icon?: string;
  link_type: "social" | "premium";
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateLinkInput extends Partial<Omit<CreateLinkInput, "creator_id">> {
  id: string;
}

// ── Creator CRUD ──────────────────────────────────────────────────────────────

export async function getCreatorBySlug(slug: string): Promise<DBCreator | null> {
  const rows = await query<DBCreator>(
    "SELECT * FROM charmlink_creators WHERE slug = $1 AND is_active = true",
    [slug]
  );
  return rows[0] ?? null;
}

export async function getCreatorByDomain(domain: string): Promise<DBCreator | null> {
  const rows = await query<DBCreator>(
    "SELECT * FROM charmlink_creators WHERE custom_domain = $1 AND is_active = true",
    [domain]
  );
  return rows[0] ?? null;
}

export async function getCreatorById(id: string): Promise<DBCreator | null> {
  const rows = await query<DBCreator>(
    "SELECT * FROM charmlink_creators WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function getAllCreators(): Promise<DBCreator[]> {
  return query<DBCreator>(
    "SELECT * FROM charmlink_creators ORDER BY created_at DESC"
  );
}

export async function createCreator(input: CreateCreatorInput): Promise<DBCreator> {
  const rows = await query<DBCreator>(
    `INSERT INTO charmlink_creators
      (slug, name, tagline, avatar_url, custom_domain, theme_bg, theme_accent, theme_text, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.slug,
      input.name,
      input.tagline ?? "",
      input.avatar_url ?? "",
      input.custom_domain ?? null,
      input.theme_bg ?? "#0a0a0a",
      input.theme_accent ?? "#e91e8a",
      input.theme_text ?? "#ffffff",
      input.is_active ?? true,
    ]
  );
  return rows[0];
}

export async function updateCreator(input: UpdateCreatorInput): Promise<DBCreator | null> {
  const { id, ...fields } = input;
  const allowed = [
    "slug", "name", "tagline", "avatar_url", "custom_domain",
    "theme_bg", "theme_accent", "theme_text", "is_active",
  ] as const;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = $${idx++}`);
      values.push((fields as Record<string, unknown>)[key]);
    }
  }

  if (setClauses.length === 0) return getCreatorById(id);

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const rows = await query<DBCreator>(
    `UPDATE charmlink_creators SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteCreator(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM charmlink_creators WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}

// ── Link CRUD ─────────────────────────────────────────────────────────────────

export async function getCreatorLinks(creatorId: string): Promise<DBLink[]> {
  return query<DBLink>(
    "SELECT * FROM charmlink_links WHERE creator_id = $1 AND is_active = true ORDER BY sort_order ASC, created_at ASC",
    [creatorId]
  );
}

export async function getLinksByCreatorSlug(slug: string): Promise<DBLink[]> {
  return query<DBLink>(
    `SELECT l.* FROM charmlink_links l
     JOIN charmlink_creators c ON c.id = l.creator_id
     WHERE c.slug = $1 AND l.is_active = true AND c.is_active = true
     ORDER BY l.sort_order ASC, l.created_at ASC`,
    [slug]
  );
}

export async function createLink(input: CreateLinkInput): Promise<DBLink> {
  const rows = await query<DBLink>(
    `INSERT INTO charmlink_links
      (creator_id, label, url, icon, link_type, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      input.creator_id,
      input.label,
      input.url,
      input.icon ?? "link",
      input.link_type,
      input.sort_order ?? 0,
      input.is_active ?? true,
    ]
  );
  return rows[0];
}

export async function updateLink(input: UpdateLinkInput): Promise<DBLink | null> {
  const { id, ...fields } = input;
  const allowed = ["label", "url", "icon", "link_type", "sort_order", "is_active"] as const;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = $${idx++}`);
      values.push((fields as Record<string, unknown>)[key]);
    }
  }

  if (setClauses.length === 0) return null;
  values.push(id);

  const rows = await query<DBLink>(
    `UPDATE charmlink_links SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteLink(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM charmlink_links WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}

// ── Event Recording ──────────────────────────────────────────────────────────

export interface RecordEventInput {
  type: "pageview" | "click";
  creator_id?: string | null;
  creator_slug: string;
  link_label?: string | null;
  link_url?: string | null;
  link_type?: string | null;
  session_id: string;
  user_agent?: string;
  referer?: string;
  country?: string;
  device?: string;
  is_bot?: boolean;
  is_instagram?: boolean;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await query(
      `INSERT INTO charmlink_events
        (type, creator_id, creator_slug, link_label, link_url, link_type,
         session_id, user_agent, referer, country, device, is_bot, is_instagram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.type,
        input.creator_id ?? null,
        input.creator_slug,
        input.link_label ?? null,
        input.link_url ?? null,
        input.link_type ?? null,
        input.session_id,
        input.user_agent ?? "",
        input.referer ?? "",
        input.country ?? "unknown",
        input.device ?? "desktop",
        input.is_bot ?? false,
        input.is_instagram ?? false,
      ]
    );
  } catch (err) {
    console.error("[db:recordEvent] error", err);
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

function periodCutoff(period: "today" | "7d" | "30d" | "all"): string | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  const days = period === "7d" ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

export async function getAnalytics(
  creatorSlug: string,
  period: "today" | "7d" | "30d" | "all"
): Promise<AnalyticsSummary> {
  const cutoff = periodCutoff(period);
  const timeFilter = cutoff ? "AND e.created_at >= $2" : "";
  const params: unknown[] = cutoff ? [creatorSlug, cutoff] : [creatorSlug];

  // Pageviews
  const pvRows = await query<{
    total: string;
    human: string;
    bot: string;
    instagram: string;
    unique_sessions: string;
  }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE NOT is_bot) AS human,
      COUNT(*) FILTER (WHERE is_bot) AS bot,
      COUNT(*) FILTER (WHERE is_instagram) AS instagram,
      COUNT(DISTINCT session_id) AS unique_sessions
     FROM charmlink_events e
     WHERE e.type = 'pageview' AND e.creator_slug = $1 ${timeFilter}`,
    params
  );

  // Clicks
  const clkRows = await query<{
    total: string;
    premium: string;
    social: string;
  }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE link_type = 'premium') AS premium,
      COUNT(*) FILTER (WHERE link_type = 'social') AS social
     FROM charmlink_events e
     WHERE e.type = 'click' AND e.creator_slug = $1 ${timeFilter}`,
    params
  );

  // Top referrers
  const refRows = await query<{ referer: string; count: string }>(
    `SELECT referer, COUNT(*) AS count
     FROM charmlink_events e
     WHERE e.creator_slug = $1 AND e.type = 'pageview' ${timeFilter}
     GROUP BY referer ORDER BY count DESC LIMIT 10`,
    params
  );

  // Device breakdown
  const devRows = await query<{ device: string; count: string }>(
    `SELECT device, COUNT(*) AS count
     FROM charmlink_events e
     WHERE e.creator_slug = $1 AND e.type = 'pageview' ${timeFilter}
     GROUP BY device`,
    params
  );

  // Country breakdown
  const cntRows = await query<{ country: string; count: string }>(
    `SELECT country, COUNT(*) AS count
     FROM charmlink_events e
     WHERE e.creator_slug = $1 AND e.type = 'pageview' ${timeFilter}
     GROUP BY country ORDER BY count DESC LIMIT 10`,
    params
  );

  // Link breakdown
  const lnkRows = await query<{ link_label: string; link_url: string; link_type: string; count: string }>(
    `SELECT link_label, link_url, link_type, COUNT(*) AS count
     FROM charmlink_events e
     WHERE e.creator_slug = $1 AND e.type = 'click' ${timeFilter}
     GROUP BY link_label, link_url, link_type ORDER BY count DESC`,
    params
  );

  const pv = pvRows[0];
  const clk = clkRows[0];
  const totalViews = parseInt(pv?.total ?? "0");
  const humanViews = parseInt(pv?.human ?? "0");
  const botViews = parseInt(pv?.bot ?? "0");
  const uniqueSessions = parseInt(pv?.unique_sessions ?? "0");
  const totalClicks = parseInt(clk?.total ?? "0");
  const premiumClicks = parseInt(clk?.premium ?? "0");
  const socialClicks = parseInt(clk?.social ?? "0");
  const instagramTraffic = parseInt(pv?.instagram ?? "0");
  const ctr = humanViews > 0 ? Math.round((premiumClicks / humanViews) * 10000) / 100 : 0;

  const deviceBreakdown: Record<DeviceType, number> = { mobile: 0, tablet: 0, desktop: 0 };
  for (const row of devRows) {
    const d = row.device as DeviceType;
    if (d in deviceBreakdown) deviceBreakdown[d] = parseInt(row.count);
  }

  return {
    creator: creatorSlug,
    period,
    totalViews,
    humanViews,
    botViews,
    uniqueSessions,
    totalClicks,
    premiumClicks,
    socialClicks,
    ctr,
    topReferrers: refRows.map((r) => ({
      referer: r.referer || "direct",
      count: parseInt(r.count),
    })),
    deviceBreakdown,
    countryBreakdown: cntRows.map((r) => ({
      country: r.country,
      count: parseInt(r.count),
    })),
    instagramTraffic,
    linkBreakdown: lnkRows.map((r) => ({
      label: r.link_label,
      url: r.link_url,
      type: r.link_type,
      clicks: parseInt(r.count),
    })),
  };
}

export async function getAnalyticsOverview(
  period: "today" | "7d" | "30d" | "all"
): Promise<{
  totalViews: number;
  humanViews: number;
  botViews: number;
  totalClicks: number;
  premiumClicks: number;
  uniqueSessions: number;
}> {
  const cutoff = periodCutoff(period);
  const timeFilter = cutoff ? "AND created_at >= $1" : "";
  const params: unknown[] = cutoff ? [cutoff] : [];

  const pvRow = await query<{
    total: string;
    human: string;
    bot: string;
    unique_sessions: string;
  }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE NOT is_bot) AS human,
      COUNT(*) FILTER (WHERE is_bot) AS bot,
      COUNT(DISTINCT session_id) AS unique_sessions
     FROM charmlink_events WHERE type = 'pageview' ${timeFilter}`,
    params
  );

  const clkRow = await query<{ total: string; premium: string }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE link_type = 'premium') AS premium
     FROM charmlink_events WHERE type = 'click' ${timeFilter}`,
    params
  );

  const pv = pvRow[0];
  const clk = clkRow[0];

  return {
    totalViews: parseInt(pv?.total ?? "0"),
    humanViews: parseInt(pv?.human ?? "0"),
    botViews: parseInt(pv?.bot ?? "0"),
    totalClicks: parseInt(clk?.total ?? "0"),
    premiumClicks: parseInt(clk?.premium ?? "0"),
    uniqueSessions: parseInt(pv?.unique_sessions ?? "0"),
  };
}

export async function getRecentEvents(limit = 20): Promise<Array<{
  id: string;
  type: string;
  creator_slug: string;
  link_label: string | null;
  link_type: string | null;
  device: string;
  country: string;
  created_at: string;
}>> {
  return query(
    `SELECT id, type, creator_slug, link_label, link_type, device, country, created_at
     FROM charmlink_events
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
}
