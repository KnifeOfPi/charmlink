import { Pool, PoolClient } from "pg";
import { AnalyticsSummary, DeviceType } from "./types";
import { AVATAR_EPOCH_FILTER, clampToEpoch } from "./stats-epoch";
import { ESCAPE_ARM_SQL, ESCAPE_ARM_SESSION_GUARD } from "./escape-experiment";

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
      // Serverless fan-out safety: each Vercel function instance gets its own
      // pool. Keep max small so concurrent instances can't exhaust the Supabase
      // pooler. DATABASE_URL must point at the TRANSACTION pooler (port 6543),
      // which multiplexes many clients over few backend connections.
      max: 3,
      idleTimeoutMillis: 10000,
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
  model_id: string | null;
  slug: string;
  name: string;
  tagline: string;
  avatar_url: string;
  custom_domain: string | null;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  is_active: boolean;
  show_location: boolean;
  location_type: string;
  sensitive_default: boolean;
  // v3 background
  bg_type: string;
  bg_gradient_type: string;
  bg_gradient_direction: string;
  bg_color_2: string;
  bg_color_3: string | null;
  // v3 floating icons
  show_floating_icons: boolean;
  floating_icon: string;
  floating_icon_count: number;
  // v3 stars
  show_stars: boolean;
  stars_count: number;
  stars_color: string;
  animation_speed: number;
  // v3 avatar border
  avatar_shape: string;
  avatar_border_style: string;
  avatar_border_color_1: string;
  avatar_border_color_2: string;
  avatar_border_color_3: string;
  // v3 misc
  is_verified: boolean;
  font: string;
  location_pill_color: string | null;
  /**
   * When set, this site is an AUTO-REDIRECT: no landing page, just the escape
   * cascade aimed at that link. Must reference a link belonging to this same
   * creator row. See supabase/migrations/20260901000000_add_autoredirect_target.
   */
  autoredirect_link_id: string | null;
  /**
   * Per-creator decoy kill switch. True (the default) means link-preview
   * scrapers get the fingerprint-free decoy instead of the real page. Flip to
   * false to exempt ONE creator rather than blast-radiusing every domain — see
   * §7.14, the flag existed only in a migration file until 2026-09-01.
   */
  cloak_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** A model is the person. Creator rows are her individual sites. */
export interface DBModel {
  id: string;
  name: string;
  tagline: string;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  bg_type: string;
  bg_gradient_type: string;
  bg_gradient_direction: string;
  bg_color_2: string;
  bg_color_3: string | null;
  avatar_shape: string;
  avatar_border_style: string;
  avatar_border_color_1: string;
  avatar_border_color_2: string;
  avatar_border_color_3: string;
  is_verified: boolean;
  font: string;
  created_at: string;
  updated_at: string;
}

/** Fields a model owns on behalf of all its sites. A creator row still HAS
 *  these columns; they are simply overridden while it belongs to a model, so
 *  unassigning restores the site's own values rather than blanking it. */
export const MODEL_OWNED_FIELDS = [
  "name", "tagline", "theme_bg", "theme_accent", "theme_text",
  "bg_type", "bg_gradient_type", "bg_gradient_direction", "bg_color_2", "bg_color_3",
  "avatar_shape", "avatar_border_style", "avatar_border_color_1",
  "avatar_border_color_2", "avatar_border_color_3", "is_verified", "font",
] as const;

export interface DBLink {
  id: string;
  creator_id: string;
  label: string;
  url: string;
  icon: string;
  link_type: "social" | "premium";
  sort_order: number;
  is_active: boolean;
  subtitle: string;
  image_url: string;
  deeplink_enabled: boolean;
  recovery_url: string;
  redirect_url: string;
  sensitive: boolean;
  badge: string | null;
  notes: string;
  tags: string[];
  // v3 visual
  show_text_glow: boolean;
  text_glow_color: string;
  text_glow_intensity: number;
  hover_animation: string | null;
  border_color: string | null;
  show_border: boolean;
  title_color: string | null;
  title_font_size: string | null;
  created_at: string;
}

export interface CreateCreatorInput {
  slug: string;
  name: string;
  /**
   * The person this site belongs to. A creator row IS a single site (slug + one
   * custom_domain), so a person with ten domains is ten rows tied together by
   * this. Leaving it null orphans the site: getModelsWithSites filters sites by
   * model, so an unassigned one renders nowhere in the admin creators list even
   * while it is live and serving traffic.
   */
  model_id?: string | null;
  tagline?: string;
  avatar_url?: string;
  custom_domain?: string | null;
  theme_bg?: string;
  theme_accent?: string;
  theme_text?: string;
  is_active?: boolean;
  show_location?: boolean;
  location_type?: string;
  sensitive_default?: boolean;
  // v3
  bg_type?: string;
  bg_gradient_type?: string;
  bg_gradient_direction?: string;
  bg_color_2?: string;
  bg_color_3?: string | null;
  show_floating_icons?: boolean;
  floating_icon?: string;
  floating_icon_count?: number;
  show_stars?: boolean;
  stars_count?: number;
  stars_color?: string;
  animation_speed?: number;
  avatar_shape?: string;
  avatar_border_style?: string;
  avatar_border_color_1?: string;
  avatar_border_color_2?: string;
  avatar_border_color_3?: string;
  is_verified?: boolean;
  font?: string;
  location_pill_color?: string | null;
  /** null clears it and the site reverts to a normal landing page. */
  autoredirect_link_id?: string | null;
  cloak_enabled?: boolean;
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
  subtitle?: string;
  image_url?: string;
  deeplink_enabled?: boolean;
  recovery_url?: string;
  redirect_url?: string;
  sensitive?: boolean;
  badge?: string | null;
  notes?: string;
  tags?: string[];
  // v3
  show_text_glow?: boolean;
  text_glow_color?: string;
  text_glow_intensity?: number;
  hover_animation?: string | null;
  border_color?: string | null;
  show_border?: boolean;
  title_color?: string | null;
  title_font_size?: string | null;
}

export interface UpdateLinkInput extends Partial<Omit<CreateLinkInput, "creator_id">> {
  id: string;
}

// ── Model CRUD ───────────────────────────────────────────────────────────────

export async function getAllModels(): Promise<DBModel[]> {
  return query<DBModel>("SELECT * FROM charmlink_models ORDER BY name ASC");
}

export async function getModelById(id: string): Promise<DBModel | null> {
  const rows = await query<DBModel>("SELECT * FROM charmlink_models WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createModel(name: string): Promise<DBModel> {
  const rows = await query<DBModel>(
    "INSERT INTO charmlink_models (name) VALUES ($1) RETURNING *",
    [name]
  );
  return rows[0];
}

export async function updateModel(
  input: { id: string } & Partial<Record<(typeof MODEL_OWNED_FIELDS)[number], unknown>>
): Promise<DBModel | null> {
  const { id, ...fields } = input;
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const key of MODEL_OWNED_FIELDS) {
    if (key in fields && fields[key] !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getModelById(id);
  setClauses.push("updated_at = now()");
  values.push(id);
  const rows = await query<DBModel>(
    `UPDATE charmlink_models SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteModel(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM charmlink_models WHERE id = $1 RETURNING id",
    [id]
  );
  return rows.length > 0;
}

/** Assign a site to a model, or detach it with null. */
export async function setCreatorModel(
  creatorId: string,
  modelId: string | null
): Promise<void> {
  await query("UPDATE charmlink_creators SET model_id = $1 WHERE id = $2", [modelId, creatorId]);
}

/** Slugs of every site under a model — used to invalidate all their rotation
 *  caches together when the shared photo pool changes. */
export async function getModelSlugs(modelId: string): Promise<string[]> {
  const rows = await query<{ slug: string }>(
    "SELECT slug FROM charmlink_creators WHERE model_id = $1",
    [modelId]
  );
  return rows.map((r) => r.slug);
}

export interface ModelWithSites extends DBModel {
  sites: Array<{
    id: string;
    slug: string;
    custom_domain: string | null;
    is_active: boolean;
    avatar_url: string;
    views: number;
    premium_clicks: number;
  }>;
  photo_count: number;
}

/** The admin creators list: one row per person, her sites nested underneath.
 *  Traffic is aggregated in SQL rather than per-site round trips, so the page
 *  is two queries regardless of how many sites exist. */
export async function getModelsWithSites(): Promise<ModelWithSites[]> {
  const models = await getAllModels();
  if (models.length === 0) return [];

  const sites = await query<{
    model_id: string | null;
    id: string;
    slug: string;
    custom_domain: string | null;
    is_active: boolean;
    avatar_url: string;
    views: string;
    premium_clicks: string;
  }>(
    `SELECT c.model_id, c.id, c.slug, c.custom_domain, c.is_active, c.avatar_url,
            COALESCE(v.views, 0) AS views,
            COALESCE(v.premium_clicks, 0) AS premium_clicks
     FROM charmlink_creators c
     LEFT JOIN (
       SELECT creator_slug,
              COUNT(*) FILTER (WHERE type = 'pageview') AS views,
              COUNT(*) FILTER (WHERE ${DEDUPED_CLICKS} AND link_type = 'premium') AS premium_clicks
       FROM charmlink_events e
       GROUP BY creator_slug
     ) v ON v.creator_slug = c.slug
     ORDER BY c.created_at ASC`
  );

  const photos = await query<{ model_id: string; n: string }>(
    `SELECT model_id, COUNT(*) AS n FROM charmlink_creator_avatars
     WHERE model_id IS NOT NULL GROUP BY model_id`
  );
  const photoByModel = new Map(photos.map((p) => [p.model_id, parseInt(p.n)]));

  return models.map((m) => ({
    ...m,
    photo_count: photoByModel.get(m.id) ?? 0,
    sites: sites
      .filter((s) => s.model_id === m.id)
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        custom_domain: s.custom_domain,
        is_active: s.is_active,
        avatar_url: s.avatar_url,
        views: parseInt(s.views),
        premium_clicks: parseInt(s.premium_clicks),
      })),
  }));
}

// ── Creator CRUD ──────────────────────────────────────────────────────────────

/** Overlay the model's shared identity onto a site row.
 *
 *  The model wins for the fields it owns, so editing "Hanna Zuki" once updates
 *  all six of her domains. The site's own columns are left intact underneath —
 *  detaching it from the model restores them rather than blanking the page.
 *  Site-specific fields (slug, custom_domain, links, location) are untouched. */
function applyModelOverlay(
  creator: DBCreator & Record<string, unknown>,
  model: DBModel | null
): DBCreator {
  if (!model) return creator;
  const merged: Record<string, unknown> = { ...creator };
  for (const key of MODEL_OWNED_FIELDS) {
    const v = (model as unknown as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) merged[key] = v;
  }
  return merged as unknown as DBCreator;
}

/** A site plus its model's shared identity, in one round trip. */
async function selectCreatorWithModel(
  where: string,
  params: unknown[]
): Promise<DBCreator | null> {
  const rows = await query<DBCreator & Record<string, unknown>>(
    `SELECT c.*, to_jsonb(m.*) AS __model
     FROM charmlink_creators c
     LEFT JOIN charmlink_models m ON m.id = c.model_id
     WHERE ${where}`,
    params
  );
  const row = rows[0];
  if (!row) return null;
  const model = (row.__model as DBModel | null) ?? null;
  delete (row as Record<string, unknown>).__model;
  return applyModelOverlay(row, model);
}

export async function getCreatorBySlug(slug: string): Promise<DBCreator | null> {
  return selectCreatorWithModel("c.slug = $1 AND c.is_active = true", [slug]);
}

export async function getCreatorByDomain(domain: string): Promise<DBCreator | null> {
  return selectCreatorWithModel("c.custom_domain = $1 AND c.is_active = true", [domain]);
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
      (slug, name, tagline, avatar_url, custom_domain, theme_bg, theme_accent, theme_text, is_active,
       show_location, location_type, sensitive_default, model_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
      input.show_location ?? false,
      input.location_type ?? "ip_auto",
      input.sensitive_default ?? false,
      input.model_id ?? null,
    ]
  );
  return rows[0];
}

export async function updateCreator(input: UpdateCreatorInput): Promise<DBCreator | null> {
  const { id, ...fields } = input;
  const allowed = [
    "slug", "name", "tagline", "avatar_url", "custom_domain",
    "theme_bg", "theme_accent", "theme_text", "is_active",
    "show_location", "location_type", "sensitive_default",
    // v3
    "bg_type", "bg_gradient_type", "bg_gradient_direction", "bg_color_2", "bg_color_3",
    "show_floating_icons", "floating_icon", "floating_icon_count",
    "show_stars", "stars_count", "stars_color", "animation_speed",
    "avatar_shape",
    "avatar_border_style", "avatar_border_color_1", "avatar_border_color_2", "avatar_border_color_3",
    "is_verified", "font", "location_pill_color",
    "autoredirect_link_id", "cloak_enabled",
    // Reassigns the site to a different person, or to none. Without this there
    // was no path at all — model_id was set once by the 365ae8c backfill and
    // never again, so every site created since has been orphaned and invisible.
    "model_id",
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
      (creator_id, label, url, icon, link_type, sort_order, is_active,
       subtitle, image_url, deeplink_enabled, recovery_url, redirect_url,
       sensitive, badge, notes, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      input.creator_id,
      input.label,
      input.url,
      input.icon ?? "link",
      input.link_type,
      input.sort_order ?? 0,
      input.is_active ?? true,
      input.subtitle ?? "",
      input.image_url ?? "",
      input.deeplink_enabled ?? false,
      input.recovery_url ?? "",
      input.redirect_url ?? "",
      input.sensitive ?? false,
      input.badge ?? null,
      input.notes ?? "",
      input.tags ?? [],
    ]
  );
  return rows[0];
}

export async function updateLink(input: UpdateLinkInput): Promise<DBLink | null> {
  const { id, ...fields } = input;
  const allowed = [
    "label", "url", "icon", "link_type", "sort_order", "is_active",
    "subtitle", "image_url", "deeplink_enabled", "recovery_url", "redirect_url",
    "sensitive", "badge", "notes", "tags",
    // v3
    "show_text_glow", "text_glow_color", "text_glow_intensity",
    "hover_animation", "border_color", "show_border",
    "title_color", "title_font_size",
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

  if (setClauses.length === 0) return null;
  values.push(id);

  const rows = await query<DBLink>(
    `UPDATE charmlink_links SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function getLinkById(id: string): Promise<DBLink | null> {
  const rows = await query<DBLink>(
    "SELECT * FROM charmlink_links WHERE id = $1",
    [id]
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

// ── Creator Avatars (carousel / A-B testing) ─────────────────────────────────

export interface DBCreatorAvatar {
  id: string;
  creator_id: string;
  url: string;
  is_active: boolean;
  is_pinned: boolean;
  sort_order: number;
  /** Circular-crop focal point, percentages. See the focal-point migration. */
  focal_x: number;
  focal_y: number;
  created_at: string;
}

/** Per-avatar performance, as measured by the events its impressions produced. */
export interface AvatarStats {
  avatar_id: string;
  impressions: number; // human pageviews that rendered this avatar
  premiumClicks: number;
  conversionRate: number; // premiumClicks / impressions, as a percentage
}

/** Hard cap on candidate photos per creator. */
export const MAX_CREATOR_AVATARS = 10;

/** Most photos a creator may pin as their permanent rotation. */
export const MAX_PINNED_AVATARS = 3;

export async function getModelAvatars(modelId: string): Promise<DBCreatorAvatar[]> {
  return query<DBCreatorAvatar>(
    `SELECT * FROM charmlink_creator_avatars
     WHERE model_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [modelId]
  );
}

/** Rotation candidates for a slug, resolved in one round trip on the page's
 *  hot path. Pinned avatars win outright when any exist — that is what
 *  "pinned" means: the admin has locked the rotation to their proven set and
 *  exploration stops until they unpin. */
export async function getRotationAvatarsBySlug(
  slug: string
): Promise<DBCreatorAvatar[]> {
  // Joined through the model, so every one of a person's domains rotates the
  // same pool and their stats pool with it.
  const rows = await query<DBCreatorAvatar>(
    `SELECT a.* FROM charmlink_creator_avatars a
     JOIN charmlink_creators c ON c.model_id = a.model_id
     WHERE c.slug = $1 AND a.is_active = true
     ORDER BY a.sort_order ASC, a.created_at ASC`,
    [slug]
  );
  const pinned = rows.filter((r) => r.is_pinned);
  return pinned.length > 0 ? pinned : rows;
}

export async function createCreatorAvatar(
  modelId: string,
  url: string
): Promise<DBCreatorAvatar> {
  const existing = await getModelAvatars(modelId);
  if (existing.length >= MAX_CREATOR_AVATARS) {
    throw new Error(
      `Avatar limit reached (${MAX_CREATOR_AVATARS}). Delete one before adding another.`
    );
  }
  const nextOrder = existing.reduce((max, a) => Math.max(max, a.sort_order), -1) + 1;
  const rows = await query<DBCreatorAvatar>(
    `INSERT INTO charmlink_creator_avatars (model_id, url, sort_order)
     VALUES ($1, $2, $3) RETURNING *`,
    [modelId, url, nextOrder]
  );
  return rows[0];
}

export async function updateCreatorAvatar(
  avatarId: string,
  fields: {
    is_active?: boolean;
    is_pinned?: boolean;
    sort_order?: number;
    focal_x?: number;
    focal_y?: number;
  }
): Promise<DBCreatorAvatar | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const key of ["is_active", "is_pinned", "sort_order", "focal_x", "focal_y"] as const) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return null;

  // Enforce the pin cap here rather than with a constraint, so the admin gets
  // a readable message instead of a raw violation.
  if (fields.is_pinned === true) {
    const owner = await query<{ model_id: string | null }>(
      "SELECT model_id FROM charmlink_creator_avatars WHERE id = $1",
      [avatarId]
    );
    if (owner[0]?.model_id) {
      const siblings = await getModelAvatars(owner[0].model_id);
      const alreadyPinned = siblings.filter((a) => a.is_pinned && a.id !== avatarId);
      if (alreadyPinned.length >= MAX_PINNED_AVATARS) {
        throw new Error(
          `At most ${MAX_PINNED_AVATARS} avatars can be pinned. Unpin one first.`
        );
      }
    }
  }

  values.push(avatarId);
  const rows = await query<DBCreatorAvatar>(
    `UPDATE charmlink_creator_avatars SET ${setClauses.join(", ")}
     WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteCreatorAvatar(avatarId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "DELETE FROM charmlink_creator_avatars WHERE id = $1 RETURNING id",
    [avatarId]
  );
  return rows.length > 0;
}

/**
 * Per-avatar impressions and premium clicks.
 *
 * Impressions count only non-bot pageviews, so a scraper storm can't make one
 * photo look like it converts badly. Clicks reuse DEDUPED_CLICKS for the same
 * one-row-per-journey rule the rest of analytics uses.
 */
export async function getAvatarStats(
  modelId: string,
  period: "today" | "7d" | "30d" | "all" = "all"
): Promise<AvatarStats[]> {
  const cutoff = periodCutoff(period);
  const params: unknown[] = cutoff ? [modelId, cutoff] : [modelId];
  const viewFilter = cutoff ? "AND e.created_at >= $2" : "";

  const rows = await query<{
    avatar_id: string;
    impressions: string;
    premium_clicks: string;
  }>(
    // Both sides count VISITORS, not rows. These two numbers become the Beta
    // posterior the sampler draws from, so they must share a unit: a visitor
    // who taps two offers is one trial and one success, not one trial and two.
    // Counting taps overstated every photo by ~20-25% and shifted the posterior
    // up and narrow, distorting how traffic gets allocated.
    `SELECT
       a.id AS avatar_id,
       COUNT(DISTINCT e.session_id) FILTER (WHERE e.type = 'pageview' AND NOT e.is_bot) AS impressions,
       COUNT(DISTINCT e.session_id) FILTER (
         WHERE ${DEDUPED_CLICKS} AND e.link_type = 'premium'
       ) AS premium_clicks
     FROM charmlink_creator_avatars a
     LEFT JOIN charmlink_events e
       ON e.avatar_id = a.id ${viewFilter} ${AVATAR_EPOCH_FILTER}
     WHERE a.model_id = $1
     GROUP BY a.id`,
    params
  );

  return rows.map((r) => {
    const impressions = parseInt(r.impressions);
    const premiumClicks = parseInt(r.premium_clicks);
    return {
      avatar_id: r.avatar_id,
      impressions,
      premiumClicks,
      conversionRate:
        impressions > 0
          ? Math.round((premiumClicks / impressions) * 10000) / 100
          : 0,
    };
  });
}

/** Avatar stats for a slug, joined to the avatar rows, for the analytics page. */
export async function getAvatarStatsBySlug(
  slug: string,
  period: "today" | "7d" | "30d" | "all"
): Promise<Array<AvatarStats & { url: string; isPinned: boolean; isActive: boolean }>> {
  const cutoff = periodCutoff(period);
  const params: unknown[] = cutoff ? [slug, cutoff] : [slug];
  const viewFilter = cutoff ? "AND e.created_at >= $2" : "";

  const rows = await query<{
    avatar_id: string;
    url: string;
    is_pinned: boolean;
    is_active: boolean;
    impressions: string;
    premium_clicks: string;
  }>(
    `SELECT
       a.id AS avatar_id,
       a.url,
       a.is_pinned,
       a.is_active,
       -- Visitors, not rows — see getAvatarStats.
       COUNT(DISTINCT e.session_id) FILTER (WHERE e.type = 'pageview' AND NOT e.is_bot) AS impressions,
       COUNT(DISTINCT e.session_id) FILTER (
         WHERE ${DEDUPED_CLICKS} AND e.link_type = 'premium'
       ) AS premium_clicks
     FROM charmlink_creator_avatars a
     JOIN charmlink_creators c ON c.model_id = a.model_id
     LEFT JOIN charmlink_events e
       ON e.avatar_id = a.id ${viewFilter} ${AVATAR_EPOCH_FILTER}
     WHERE c.slug = $1
     GROUP BY a.id, a.url, a.is_pinned, a.is_active, a.sort_order, a.created_at
     ORDER BY a.sort_order ASC, a.created_at ASC`,
    params
  );

  return rows.map((r) => {
    const impressions = parseInt(r.impressions);
    const premiumClicks = parseInt(r.premium_clicks);
    return {
      avatar_id: r.avatar_id,
      url: r.url,
      isPinned: r.is_pinned,
      isActive: r.is_active,
      impressions,
      premiumClicks,
      conversionRate:
        impressions > 0
          ? Math.round((premiumClicks / impressions) * 10000) / 100
          : 0,
    };
  });
}

// ── Event Recording ──────────────────────────────────────────────────────────

export interface RecordEventInput {
  // 'autoredirect' is deliberately its OWN type rather than a pageview+click
  // pair. An auto-redirect site has no page to view and nothing to tap, so
  // recording it as either would poison CTR — pageview-only drags the creator's
  // rate toward zero, pageview+click pins it at 100%. Every analytics query
  // filters on type='pageview' or DEDUPED_CLICKS (type='click'), so this type is
  // inert to all of them by construction. Real conversion for these sites is
  // measured downstream via the OnlyFans tracking code.
  type: "pageview" | "click" | "escape_fallback" | "autoredirect";
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
  /** Which carousel avatar was on screen. NULL when the creator has none. */
  avatar_id?: string | null;
}

/** A client-supplied avatar id is only stored if it is a syntactically valid
 *  UUID — the column is a FK, and a malformed string would make the whole
 *  INSERT throw and silently drop the event. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    const avatarId =
      input.avatar_id && UUID_RE.test(input.avatar_id) ? input.avatar_id : null;
    await query(
      `INSERT INTO charmlink_events
        (type, creator_id, creator_slug, link_label, link_url, link_type,
         session_id, user_agent, referer, country, device, is_bot, is_instagram,
         avatar_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
        avatarId,
      ]
    );
  } catch (err) {
    console.error("[db:recordEvent] error", err);
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

// ── Click de-duplication ──────────────────────────────────────────────────────
//
// A single user journey can write TWO click rows:
//   1. the client beacon to /api/track, fired the instant the link is tapped;
//   2. a server-side row from /api/redirect/[linkId], for the links that route
//      through the redirect handler (sensitive links via /r/, and any link with
//      a redirect_url set).
//
// Counting both inflated premium clicks — measured at 6,355 duplicated journeys
// against production. The beacon fires for every journey regardless of link
// type, so it is the complete and consistent series and is what the click
// metric counts. The redirect rows are NOT deleted: the gap between the two is
// the funnel signal (tapped vs. actually served a redirect to the destination),
// which is how the age-gate completion rate was measured.
//
// /api/redirect has no access to the client's sessionStorage id, so it writes
// this sentinel instead. Historical rows use the same value — do not change it
// without backfilling, or old duplicates will silently re-enter the counts.
export const REDIRECT_EVENT_SESSION_ID = "redirect";

/** SQL predicate isolating the beacon-sourced click rows (one per journey). */
const DEDUPED_CLICKS = `e.type = 'click' AND e.session_id <> '${REDIRECT_EVENT_SESSION_ID}'`;

/**
 * Start of an analytics window.
 *
 * Every window is held at STATS_EPOCH, so no dashboard figure reaches back into
 * the period when escapes double-counted pageviews — "All Time" reads as "all
 * trustworthy time". The rows are still there; this only decides what is shown.
 *
 * The `string | null` return is kept deliberately: null is the un-clamped "all
 * time" path, and dropping `clampToEpoch` here is all it takes to show the full
 * history again. It simply cannot be reached while the epoch is in force.
 */
function periodCutoff(period: "today" | "7d" | "30d" | "all"): string | null {
  if (period === "all") return clampToEpoch(null);
  if (period === "today") return clampToEpoch(pacificMidnightUTC(new Date()).toISOString());
  const now = new Date();
  const days = period === "7d" ? 7 : 30;
  now.setDate(now.getDate() - days);
  return clampToEpoch(now.toISOString());
}

/**
 * Midnight Pacific time (PST or PDT, whichever is in effect) for `now`,
 * expressed as an instant. Vercel's Node runtime runs in UTC, so a plain
 * `Date.setHours(0,0,0,0)` zeroes to midnight UTC — 8 (or 7) hours before
 * "Today" is actually supposed to reset — which is the bug this replaces.
 * Fixed -08:00 would be wrong for half the year, so this reads the offset
 * America/Los_Angeles is actually observing right now.
 */
function pacificMidnightUTC(now: Date): Date {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-");
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-7"
  const offsetHours = parseInt(offsetName.replace("GMT", ""), 10);
  const sign = offsetHours <= 0 ? "-" : "+";
  const isoOffset = `${sign}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
  return new Date(`${year}-${month}-${day}T00:00:00${isoOffset}`);
}

/** Bucket granularity for the clicks-over-time chart, keyed to the period filter. */
function timeseriesBucketUnit(period: "today" | "7d" | "30d" | "all"): "hour" | "day" | "week" {
  if (period === "today") return "hour";
  if (period === "all") return "week";
  return "day";
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
    converting_sessions: string;
  }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE link_type = 'premium') AS premium,
      COUNT(*) FILTER (WHERE link_type = 'social') AS social,
      COUNT(DISTINCT session_id) FILTER (WHERE link_type = 'premium') AS converting_sessions
     FROM charmlink_events e
     WHERE ${DEDUPED_CLICKS} AND e.creator_slug = $1 ${timeFilter}`,
    params
  );

  // Top referrers — grouped by hostname, not the raw referer string. The raw
  // Referer header includes path/query (e.g. https://fav-site.com/post/123,
  // https://fav-site.com/?utm=x), so grouping on the exact string split what
  // is really one traffic source into many rows that all *display* the same
  // (the frontend already strips to hostname for the label) — the "top 10"
  // ended up being fragments of one source rather than the top 10 sources.
  const refRows = await query<{ referer: string; count: string }>(
    `SELECT
      CASE WHEN referer = '' THEN ''
           ELSE regexp_replace(referer, '^https?://([^/]+).*$', '\\1')
      END AS referer,
      COUNT(*) AS count
     FROM charmlink_events e
     WHERE e.creator_slug = $1 AND e.type = 'pageview' ${timeFilter}
     GROUP BY 1 ORDER BY count DESC LIMIT 10`,
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
     WHERE e.creator_slug = $1 AND ${DEDUPED_CLICKS} ${timeFilter}
     GROUP BY link_label, link_url, link_type ORDER BY count DESC`,
    params
  );

  // Clicks over time — bucketed by hour/day/week depending on period, zero-filled
  // via generate_series so gaps in traffic show as flat gaps rather than a
  // shortened axis. When cutoff is null ("all"), the range starts at the
  // creator's first-ever event instead of an arbitrary lookback.
  const bucketUnit = timeseriesBucketUnit(period);
  const tsRows = await query<{ bucket: string; total: string; premium: string }>(
    `WITH bounds AS (
       SELECT
         date_trunc($2, COALESCE($3::timestamptz, (
           SELECT MIN(created_at) FROM charmlink_events WHERE creator_slug = $1
         ))) AS start_ts,
         date_trunc($2, now()) AS end_ts
     ),
     buckets AS (
       SELECT generate_series(start_ts, end_ts, ('1 ' || $2)::interval) AS bucket
       FROM bounds
       WHERE start_ts IS NOT NULL
     )
     SELECT
       b.bucket,
       COUNT(e.id) AS total,
       COUNT(e.id) FILTER (WHERE e.link_type = 'premium') AS premium
     FROM buckets b
     LEFT JOIN charmlink_events e
       ON e.creator_slug = $1 AND ${DEDUPED_CLICKS}
       AND date_trunc($2, e.created_at) = b.bucket
     GROUP BY b.bucket
     ORDER BY b.bucket`,
    [creatorSlug, bucketUnit, cutoff]
  );

  // Avatar carousel results. Returns [] for the (currently typical) creator who
  // has no candidate photos, so the analytics card simply omits the section.
  const avatarRows = await getAvatarStatsBySlug(creatorSlug, period);

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
  const convertingSessions = parseInt(clk?.converting_sessions ?? "0");
  // Sessions, not taps — see AnalyticsSummary.ctr.
  const ctr = humanViews > 0 ? Math.round((convertingSessions / humanViews) * 10000) / 100 : 0;

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
    convertingSessions,
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
    clickTimeseries: tsRows.map((r) => ({
      // pg returns date_trunc() as a Date, not a string. Normalise here so the
      // declared type is honest and callers can use it as a stable map key.
      bucket: new Date(r.bucket).toISOString(),
      total: parseInt(r.total),
      premium: parseInt(r.premium),
    })),
    avatarPerformance: avatarRows.map((r) => ({
      avatarId: r.avatar_id,
      url: r.url,
      isPinned: r.isPinned,
      isActive: r.isActive,
      impressions: r.impressions,
      premiumClicks: r.premiumClicks,
      conversionRate: r.conversionRate,
    })),
  };
}


/**
 * Every creator's summary in a fixed number of queries.
 *
 * The overview page previously called getAnalytics() once per creator inside a
 * Promise.all. At 70 creators and seven queries each that is ~490 queries fired
 * simultaneously at a pool capped at 3 connections, so they queued past
 * connectionTimeoutMillis and the whole endpoint 500'd — the dashboard rendered
 * zeros while the data was perfectly intact. Every query below is instead
 * grouped by creator_slug, so cost is flat in the number of creators.
 */
export async function getAnalyticsBatch(
  period: "today" | "7d" | "30d" | "all"
): Promise<AnalyticsSummary[]> {
  const cutoff = periodCutoff(period);
  const params: unknown[] = cutoff ? [cutoff] : [];
  const tf = cutoff ? "AND e.created_at >= $1" : "";
  const bucketUnit = timeseriesBucketUnit(period);

  const [pv, clk, refs, dev, cnt, lnk, ts, av] = await Promise.all([
    query<{ creator_slug: string; total: string; human: string; bot: string; instagram: string; unique_sessions: string }>(
      `SELECT creator_slug, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE NOT is_bot) AS human,
              COUNT(*) FILTER (WHERE is_bot) AS bot,
              COUNT(*) FILTER (WHERE is_instagram) AS instagram,
              COUNT(DISTINCT session_id) AS unique_sessions
       FROM charmlink_events e WHERE e.type='pageview' ${tf} GROUP BY creator_slug`, params),
    query<{ creator_slug: string; total: string; premium: string; social: string; converting_sessions: string }>(
      `SELECT creator_slug, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE link_type='premium') AS premium,
              COUNT(*) FILTER (WHERE link_type='social') AS social,
              COUNT(DISTINCT session_id) FILTER (WHERE link_type='premium') AS converting_sessions
       FROM charmlink_events e WHERE ${DEDUPED_CLICKS} ${tf} GROUP BY creator_slug`, params),
    query<{ creator_slug: string; referer: string; count: string }>(
      `SELECT creator_slug, referer, count FROM (
         SELECT creator_slug,
                CASE WHEN referer='' THEN '' ELSE regexp_replace(referer,'^https?://([^/]+).*$','\\1') END AS referer,
                COUNT(*) AS count,
                ROW_NUMBER() OVER (PARTITION BY creator_slug ORDER BY COUNT(*) DESC) AS rn
         FROM charmlink_events e WHERE e.type='pageview' ${tf} GROUP BY creator_slug, 2
       ) t WHERE rn <= 10`, params),
    query<{ creator_slug: string; device: string; count: string }>(
      `SELECT creator_slug, device, COUNT(*) AS count FROM charmlink_events e
       WHERE e.type='pageview' ${tf} GROUP BY creator_slug, device`, params),
    query<{ creator_slug: string; country: string; count: string }>(
      `SELECT creator_slug, country, count FROM (
         SELECT creator_slug, country, COUNT(*) AS count,
                ROW_NUMBER() OVER (PARTITION BY creator_slug ORDER BY COUNT(*) DESC) AS rn
         FROM charmlink_events e WHERE e.type='pageview' ${tf} GROUP BY creator_slug, country
       ) t WHERE rn <= 10`, params),
    query<{ creator_slug: string; link_label: string; link_url: string; link_type: string; count: string }>(
      `SELECT creator_slug, link_label, link_url, link_type, COUNT(*) AS count
       FROM charmlink_events e WHERE ${DEDUPED_CLICKS} ${tf}
       GROUP BY creator_slug, link_label, link_url, link_type ORDER BY count DESC`, params),
    query<{ creator_slug: string; bucket: string; total: string; premium: string }>(
      `SELECT creator_slug, date_trunc('${bucketUnit}', created_at) AS bucket,
              COUNT(*) AS total, COUNT(*) FILTER (WHERE link_type='premium') AS premium
       FROM charmlink_events e WHERE ${DEDUPED_CLICKS} ${tf}
       GROUP BY creator_slug, 2 ORDER BY 2`, params),
    query<{ creator_slug: string; avatar_id: string; url: string; is_pinned: boolean; is_active: boolean; impressions: string; premium_clicks: string }>(
      // `e.creator_slug = c.slug` is what makes these rows per-DOMAIN. The photo
      // pool is owned by the model, so without it every one of her slugs joined
      // the same model-wide events and reported identical totals — fine for the
      // rolled-up card, but it made the per-domain view claim a photo's whole
      // model-wide audience for one domain. rollupByModel sums these back up,
      // so the model-level number is unchanged.
      `SELECT c.slug AS creator_slug, a.id AS avatar_id, a.url, a.is_pinned, a.is_active,
              -- Visitors, not rows — see getAvatarStats.
              COUNT(DISTINCT e.session_id) FILTER (WHERE e.type='pageview' AND NOT e.is_bot) AS impressions,
              COUNT(DISTINCT e.session_id) FILTER (WHERE ${DEDUPED_CLICKS} AND e.link_type='premium') AS premium_clicks
       FROM charmlink_creator_avatars a
       JOIN charmlink_creators c ON c.model_id = a.model_id
       LEFT JOIN charmlink_events e
         ON e.avatar_id = a.id AND e.creator_slug = c.slug ${tf} ${AVATAR_EPOCH_FILTER}
       GROUP BY c.slug, a.id, a.url, a.is_pinned, a.is_active, a.sort_order, a.created_at
       ORDER BY a.sort_order ASC, a.created_at ASC`, params),
  ]);

  const bySlug = <T extends { creator_slug: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const arr = m.get(r.creator_slug);
      if (arr) arr.push(r);
      else m.set(r.creator_slug, [r]);
    }
    return m;
  };
  const pvBy = new Map(pv.map((r) => [r.creator_slug, r]));
  const clkBy = new Map(clk.map((r) => [r.creator_slug, r]));
  const refBy = bySlug(refs), devBy = bySlug(dev), cntBy = bySlug(cnt);
  const lnkBy = bySlug(lnk), tsBy = bySlug(ts), avBy = bySlug(av);

  const creators = await getAllCreators();
  return creators.map((c): AnalyticsSummary => {
    const p = pvBy.get(c.slug);
    const k = clkBy.get(c.slug);
    const humanViews = parseInt(p?.human ?? "0");
    const premiumClicks = parseInt(k?.premium ?? "0");
    const convertingSessions = parseInt(k?.converting_sessions ?? "0");
    const deviceBreakdown: Record<DeviceType, number> = { mobile: 0, tablet: 0, desktop: 0 };
    for (const d of devBy.get(c.slug) ?? []) {
      const key = d.device as DeviceType;
      if (key in deviceBreakdown) deviceBreakdown[key] = parseInt(d.count);
    }
    return {
      creator: c.slug,
      period,
      totalViews: parseInt(p?.total ?? "0"),
      humanViews,
      botViews: parseInt(p?.bot ?? "0"),
      uniqueSessions: parseInt(p?.unique_sessions ?? "0"),
      totalClicks: parseInt(k?.total ?? "0"),
      premiumClicks,
      socialClicks: parseInt(k?.social ?? "0"),
      convertingSessions,
      // Sessions, not taps — see AnalyticsSummary.ctr.
      ctr: humanViews > 0 ? Math.round((convertingSessions / humanViews) * 10000) / 100 : 0,
      topReferrers: (refBy.get(c.slug) ?? []).map((r) => ({ referer: r.referer || "direct", count: parseInt(r.count) })),
      deviceBreakdown,
      countryBreakdown: (cntBy.get(c.slug) ?? []).map((r) => ({ country: r.country, count: parseInt(r.count) })),
      instagramTraffic: parseInt(p?.instagram ?? "0"),
      linkBreakdown: (lnkBy.get(c.slug) ?? []).map((r) => ({
        label: r.link_label, url: r.link_url, type: r.link_type, clicks: parseInt(r.count),
      })),
      clickTimeseries: (tsBy.get(c.slug) ?? []).map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        total: parseInt(r.total),
        premium: parseInt(r.premium),
      })),
      avatarPerformance: (avBy.get(c.slug) ?? []).map((r) => {
        const impressions = parseInt(r.impressions);
        const pc = parseInt(r.premium_clicks);
        return {
          avatarId: r.avatar_id, url: r.url, isPinned: r.is_pinned, isActive: r.is_active,
          impressions, premiumClicks: pc,
          conversionRate: impressions > 0 ? Math.round((pc / impressions) * 10000) / 100 : 0,
        };
      }),
    };
  });
}

// ── Escape split test ────────────────────────────────────────────────────────

export interface EscapeExperimentArm {
  arm: "escape" | "stay";
  visitors: number;
  converted: number;
  /** Sessions that beaconed a failed escape. Must be ~0 for `stay` once the
   *  suppression is live — that is the assignment-is-working signal. */
  escapeFailures: number;
}

export interface EscapeExperimentDaily {
  day: string;
  escapeVisitors: number;
  escapeConverted: number;
  stayVisitors: number;
  stayConverted: number;
}

/**
 * Read the escape split test.
 *
 * Conversion is joined on `session_id` and NEVER filtered by `is_instagram`:
 * an escape-arm visitor clicks from Safari, so their click carries
 * `is_instagram = false`. Filtering clicks by surface would discard exactly the
 * conversions that arm produced and hand the win to `stay` automatically.
 */
export async function getEscapeExperimentStats(
  slug: string,
  since: string
): Promise<{ arms: EscapeExperimentArm[]; daily: EscapeExperimentDaily[] }> {
  const assigned = `
    assigned AS (
      SELECT session_id, ${ESCAPE_ARM_SQL} AS arm, MIN(created_at) AS first_seen
      FROM charmlink_events
      WHERE creator_slug = $1
        AND type = 'pageview' AND is_instagram AND NOT is_bot
        AND user_agent ILIKE '%instagram%'
        AND ${ESCAPE_ARM_SESSION_GUARD}
        AND created_at >= $2
      GROUP BY session_id
    ),
    converted AS (
      SELECT DISTINCT e.session_id FROM charmlink_events e
      WHERE ${DEDUPED_CLICKS} AND e.link_type = 'premium' AND e.created_at >= $2
    )`;

  const [totals, daily] = await Promise.all([
    query<{ arm: "escape" | "stay"; visitors: number; converted: number; escape_failures: number }>(
      `WITH ${assigned},
       bailed AS (
         SELECT DISTINCT session_id FROM charmlink_events
         WHERE type = 'escape_fallback' AND created_at >= $2
       )
       SELECT a.arm,
              COUNT(*)::int AS visitors,
              COUNT(c.session_id)::int AS converted,
              COUNT(b.session_id)::int AS escape_failures
       FROM assigned a
       LEFT JOIN converted c ON c.session_id = a.session_id
       LEFT JOIN bailed    b ON b.session_id = a.session_id
       GROUP BY a.arm`,
      [slug, since]
    ),
    query<{ day: string; arm: "escape" | "stay"; visitors: number; converted: number }>(
      `WITH ${assigned}
       SELECT to_char(date_trunc('day', a.first_seen), 'YYYY-MM-DD') AS day,
              a.arm,
              COUNT(*)::int AS visitors,
              COUNT(c.session_id)::int AS converted
       FROM assigned a
       LEFT JOIN converted c ON c.session_id = a.session_id
       GROUP BY 1, 2 ORDER BY 1`,
      [slug, since]
    ),
  ]);

  const byDay = new Map<string, EscapeExperimentDaily>();
  for (const r of daily) {
    const row =
      byDay.get(r.day) ??
      { day: r.day, escapeVisitors: 0, escapeConverted: 0, stayVisitors: 0, stayConverted: 0 };
    if (r.arm === "escape") {
      row.escapeVisitors = r.visitors;
      row.escapeConverted = r.converted;
    } else {
      row.stayVisitors = r.visitors;
      row.stayConverted = r.converted;
    }
    byDay.set(r.day, row);
  }

  const arms: EscapeExperimentArm[] = (["escape", "stay"] as const).map((arm) => {
    const row = totals.find((t) => t.arm === arm);
    return {
      arm,
      visitors: row?.visitors ?? 0,
      converted: row?.converted ?? 0,
      escapeFailures: row?.escape_failures ?? 0,
    };
  });

  return { arms, daily: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) };
}

export async function getAnalyticsOverview(
  period: "today" | "7d" | "30d" | "all"
): Promise<{
  totalViews: number;
  humanViews: number;
  botViews: number;
  totalClicks: number;
  premiumClicks: number;
  /** Distinct sessions with a premium click — the CTR numerator. See
   *  AnalyticsSummary.ctr for why this is not premiumClicks. */
  convertingSessions: number;
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

  const clkRow = await query<{ total: string; premium: string; converting_sessions: string }>(
    `SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE link_type = 'premium') AS premium,
      COUNT(DISTINCT session_id) FILTER (WHERE link_type = 'premium') AS converting_sessions
     FROM charmlink_events e WHERE ${DEDUPED_CLICKS} ${timeFilter}`,
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
    convertingSessions: parseInt(clk?.converting_sessions ?? "0"),
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

// ── Honeypot Logging ──────────────────────────────────────────────────────────

export async function logHoneypotHit(
  ip: string,
  userAgent: string,
  referer: string
): Promise<void> {
  await query(
    `INSERT INTO honeypot_logs (ip, user_agent, referer) VALUES ($1, $2, $3)`,
    [ip.slice(0, 100), userAgent.slice(0, 512), referer.slice(0, 512)]
  );
}
