"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "../../useAdminAuth";
import { AdminNav } from "../../AdminNav";

interface DBCreator {
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
  show_location: boolean;
  location_type: string;
  sensitive_default: boolean;
  created_at: string;
  updated_at: string;
}

interface DBLink {
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
  created_at: string;
}

interface AnalyticsSummary {
  totalViews: number;
  humanViews: number;
  premiumClicks: number;
  ctr: number;
}

const inputCls = "w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-[#e91e8a] transition-colors";
const labelCls = "block text-gray-400 text-xs mb-1";

// ── Link Row ──────────────────────────────────────────────────────────────────

function LinkRow({
  link,
  onDelete,
  onToggle,
}: {
  link: DBLink;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const icons: Record<string, string> = {
    twitter: "𝕏", tiktok: "♪", instagram: "📸", youtube: "▶",
    star: "⭐", crown: "👑", heart: "💖", link: "🔗",
  };
  const badgeColors: Record<string, string> = {
    new: "bg-green-800 text-green-300",
    popular: "bg-orange-800 text-orange-300",
    exclusive: "bg-purple-800 text-purple-300",
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${link.is_active ? "border-[#333] bg-[#111]" : "border-[#222] bg-[#0d0d0d] opacity-60"}`}>
      <span className="text-base w-6 text-center flex-shrink-0 mt-0.5">{icons[link.icon] ?? "🔗"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white text-sm font-medium truncate">{link.label}</p>
          {link.badge && (
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${badgeColors[link.badge] ?? "bg-gray-700 text-gray-300"}`}>
              {link.badge}
            </span>
          )}
          {link.sensitive && <span className="text-[10px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded-full">sensitive</span>}
          {link.deeplink_enabled && <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded-full">deeplink</span>}
        </div>
        {link.subtitle && <p className="text-gray-400 text-xs mt-0.5 truncate">{link.subtitle}</p>}
        <p className="text-gray-500 text-xs truncate">{link.url}</p>
        {link.tags && link.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {link.tags.map((t) => (
              <span key={t} className="text-[10px] bg-[#222] text-gray-400 px-1.5 py-0.5 rounded-full">#{t}</span>
            ))}
          </div>
        )}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${link.link_type === "premium" ? "bg-pink-900 text-pink-300" : "bg-blue-900 text-blue-300"}`}>
        {link.link_type}
      </span>
      <button
        onClick={() => onToggle(link.id, !link.is_active)}
        className="text-gray-500 hover:text-white text-xs transition-colors flex-shrink-0"
        title={link.is_active ? "Deactivate" : "Activate"}
      >
        {link.is_active ? "⏸" : "▶"}
      </button>
      <button
        onClick={() => onDelete(link.id)}
        className="text-red-700 hover:text-red-400 text-xs transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

// ── Add Link Form ─────────────────────────────────────────────────────────────

interface AddLinkFormProps {
  creatorId: string;
  onAdded: () => void;
  authHeaders: () => Record<string, string>;
}

function AddLinkForm({ creatorId, onAdded, authHeaders }: AddLinkFormProps) {
  const [form, setForm] = useState({
    label: "",
    url: "",
    icon: "link",
    link_type: "social" as "social" | "premium",
    subtitle: "",
    image_url: "",
    deeplink_enabled: false,
    recovery_url: "",
    redirect_url: "",
    sensitive: false,
    badge: "" as string,
    notes: "",
    tags: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const tagsArray = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        label: form.label,
        url: form.url,
        icon: form.icon,
        link_type: form.link_type,
        subtitle: form.subtitle,
        image_url: form.image_url,
        deeplink_enabled: form.deeplink_enabled,
        recovery_url: form.recovery_url,
        redirect_url: form.redirect_url,
        sensitive: form.sensitive,
        badge: form.badge || null,
        notes: form.notes,
        tags: tagsArray,
      };

      const res = await fetch(`/api/admin/creators/${creatorId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setForm({
          label: "", url: "", icon: "link", link_type: "social",
          subtitle: "", image_url: "", deeplink_enabled: false, recovery_url: "",
          redirect_url: "", sensitive: false, badge: "", notes: "", tags: "",
        });
        setExpanded(false);
        onAdded();
      } else {
        const err = await res.json();
        setError((err as { error?: string }).error ?? "Failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-[#111] border border-[#333] rounded-lg space-y-2">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Add Link</p>

      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Label</label>
          <input className={inputCls} value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} required placeholder="Twitter" />
        </div>
        <div>
          <label className={labelCls}>Icon</label>
          <select className={inputCls} value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}>
            <option value="link">🔗 Link</option>
            <option value="twitter">𝕏 Twitter</option>
            <option value="tiktok">♪ TikTok</option>
            <option value="instagram">📸 Instagram</option>
            <option value="youtube">▶ YouTube</option>
            <option value="star">⭐ Star</option>
            <option value="crown">👑 Crown</option>
            <option value="heart">💖 Heart</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>URL</label>
        <input className={inputCls} value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required placeholder="https://..." type="url" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={form.link_type} onChange={(e) => setForm((p) => ({ ...p, link_type: e.target.value as "social" | "premium" }))}>
            <option value="social">Social</option>
            <option value="premium">Premium (OF/Fanvue)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Badge</label>
          <select className={inputCls} value={form.badge} onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))}>
            <option value="">None</option>
            <option value="new">🟢 New</option>
            <option value="popular">🟠 Popular</option>
            <option value="exclusive">🟣 Exclusive</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Subtitle</label>
        <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))} placeholder="Secondary text under link" />
      </div>

      {/* Toggle for advanced fields */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-gray-500 hover:text-gray-300 text-xs transition-colors w-full text-left"
      >
        {expanded ? "▲ Hide advanced options" : "▼ Show advanced options"}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-[#222] pt-2">
          <div>
            <label className={labelCls}>Image URL (for image card style)</label>
            <input className={inputCls} value={form.image_url} onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
          </div>

          <div>
            <label className={labelCls}>Redirect URL (overrides destination)</label>
            <input className={inputCls} value={form.redirect_url} onChange={(e) => setForm((p) => ({ ...p, redirect_url: e.target.value }))} placeholder="https://..." />
          </div>

          <div>
            <label className={labelCls}>Recovery URL (deeplink fallback)</label>
            <input className={inputCls} value={form.recovery_url} onChange={(e) => setForm((p) => ({ ...p, recovery_url: e.target.value }))} placeholder="https://..." />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sensitive}
                onChange={(e) => setForm((p) => ({ ...p, sensitive: e.target.checked }))}
                className="w-4 h-4 accent-[#e91e8a]"
              />
              Sensitive content
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.deeplink_enabled}
                onChange={(e) => setForm((p) => ({ ...p, deeplink_enabled: e.target.checked }))}
                className="w-4 h-4 accent-[#e91e8a]"
              />
              Enable deeplink
            </label>
          </div>

          <div>
            <label className={labelCls}>Notes (internal, admin only)</label>
            <textarea className={inputCls + " resize-none"} rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Internal notes..." />
          </div>

          <div>
            <label className={labelCls}>Tags (comma-separated, admin only)</label>
            <input className={inputCls} value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="promo, featured, seasonal" />
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
      >
        {loading ? "Adding..." : "Add Link"}
      </button>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EditCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, authHeaders } = useAdminAuth();
  const router = useRouter();

  const [creator, setCreator] = useState<DBCreator | null>(null);
  const [links, setLinks] = useState<DBLink[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [domainStatus, setDomainStatus] = useState<string>("");
  const [addingDomain, setAddingDomain] = useState(false);

  const [form, setForm] = useState<Partial<DBCreator>>({});

  useEffect(() => {
    if (!ready) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  async function loadAll() {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [creatorRes, linksRes] = await Promise.all([
        fetch(`/api/admin/creators/${id}`, { headers }),
        fetch(`/api/admin/creators/${id}/links`, { headers }),
      ]);

      if (creatorRes.ok) {
        const c: DBCreator = await creatorRes.json();
        setCreator(c);
        setForm(c);

        fetch(`/api/analytics/${c.slug}?period=30d`, { headers }).then(async (r) => {
          if (r.ok) setAnalytics(await r.json());
        });
      } else {
        router.push("/admin/creators");
        return;
      }
      if (linksRes.ok) {
        setLinks(await linksRes.json());
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      const payload = {
        ...form,
        custom_domain: form.custom_domain || null,
      };
      const res = await fetch(`/api/admin/creators/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setCreator(updated);
        setForm(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        setSaveError((err as { error?: string }).error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLink(linkId: string) {
    await fetch(`/api/admin/creators/${id}/links`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ linkId }),
    });
    loadAll();
  }

  async function handleToggleLink(linkId: string, isActive: boolean) {
    await fetch(`/api/admin/creators/${id}/links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id: linkId, is_active: isActive }),
    });
    loadAll();
  }

  async function handleAddToVercel() {
    const domain = form.custom_domain;
    if (!domain) return;
    setAddingDomain(true);
    setDomainStatus("");
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (res.ok) {
        setDomainStatus((data as { verified?: boolean }).verified ? "✅ Verified" : "⏳ Added — awaiting DNS verification");
      } else {
        setDomainStatus(`❌ ${(data as { error?: string }).error}`);
      }
    } finally {
      setAddingDomain(false);
    }
  }

  function setField<K extends keyof DBCreator>(key: K, value: DBCreator[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  if (!ready) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AdminNav />
        <div className="text-gray-500 text-center py-16">Loading...</div>
      </div>
    );
  }
  if (!creator) return null;

  const socialLinks = links.filter((l) => l.link_type === "social");
  const premiumLinks = links.filter((l) => l.link_type === "premium");

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors">← Back</button>
          <div>
            <h1 className="text-2xl font-bold text-white">{creator.name}</h1>
            <p className="text-gray-500 text-sm">/{creator.slug}</p>
          </div>
        </div>

        {/* Analytics summary */}
        {analytics && (
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: "Views (30d)", value: analytics.humanViews },
              { label: "Premium Clicks", value: analytics.premiumClicks },
              { label: "CTR", value: `${analytics.ctr}%` },
              { label: "Total Views", value: analytics.totalViews },
            ].map((s) => (
              <div key={s.label} className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-white text-xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Edit form */}
          <div className="space-y-4">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Creator Details</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input className={inputCls} value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelCls}>Slug</label>
                    <input className={inputCls} value={form.slug ?? ""} onChange={(e) => setField("slug", e.target.value.toLowerCase())} required />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Tagline</label>
                  <input className={inputCls} value={form.tagline ?? ""} onChange={(e) => setField("tagline", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Avatar URL</label>
                  <input className={inputCls} value={form.avatar_url ?? ""} onChange={(e) => setField("avatar_url", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Custom Domain</label>
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      value={form.custom_domain ?? ""}
                      onChange={(e) => setField("custom_domain", e.target.value || null)}
                      placeholder="holly.example.com"
                    />
                    <button
                      type="button"
                      onClick={handleAddToVercel}
                      disabled={!form.custom_domain || addingDomain}
                      className="flex-shrink-0 bg-[#333] hover:bg-[#444] disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                    >
                      {addingDomain ? "..." : "Add to Vercel"}
                    </button>
                  </div>
                  {domainStatus && <p className="text-xs mt-1 text-gray-400">{domainStatus}</p>}
                </div>

                <div>
                  <label className={labelCls}>Theme Colors</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["theme_bg", "theme_accent", "theme_text"] as const).map((key) => (
                      <div key={key}>
                        <label className="text-gray-600 text-xs mb-1 block capitalize">{key.replace("theme_", "")}</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={(form[key] as string) ?? "#000000"}
                            onChange={(e) => setField(key, e.target.value)}
                            className="w-7 h-7 rounded border border-[#333] cursor-pointer bg-transparent"
                          />
                          <input
                            className={inputCls + " !py-1 !px-2 text-xs"}
                            value={(form[key] as string) ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Behavior toggles */}
                <div className="border-t border-[#222] pt-3 space-y-2">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Behavior</p>
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active ?? true}
                      onChange={(e) => setField("is_active", e.target.checked)}
                      className="w-4 h-4 accent-[#e91e8a]"
                    />
                    Active (visible to visitors)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.show_location ?? false}
                      onChange={(e) => setField("show_location", e.target.checked)}
                      className="w-4 h-4 accent-[#e91e8a]"
                    />
                    Show visitor location
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.sensitive_default ?? false}
                      onChange={(e) => setField("sensitive_default", e.target.checked)}
                      className="w-4 h-4 accent-[#e91e8a]"
                    />
                    Sensitive content default (all links)
                  </label>
                  {form.show_location && (
                    <div>
                      <label className={labelCls}>Location Type</label>
                      <select
                        className={inputCls}
                        value={form.location_type ?? "ip_auto"}
                        onChange={(e) => setField("location_type", e.target.value)}
                      >
                        <option value="ip_auto">Auto (IP geolocation)</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                  )}
                </div>

                {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                {saveSuccess && <p className="text-green-400 text-sm">✓ Saved successfully</p>}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </form>
            </div>
          </div>

          {/* Links management */}
          <div className="space-y-4">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Social Links ({socialLinks.length})</h2>
              <div className="space-y-2 mb-3">
                {socialLinks.length === 0 ? (
                  <p className="text-gray-600 text-sm">No social links yet</p>
                ) : (
                  socialLinks.map((l) => (
                    <LinkRow key={l.id} link={l} onDelete={handleDeleteLink} onToggle={handleToggleLink} />
                  ))
                )}
              </div>
            </div>

            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Premium Links ({premiumLinks.length})</h2>
              <div className="space-y-2 mb-3">
                {premiumLinks.length === 0 ? (
                  <p className="text-gray-600 text-sm">No premium links yet</p>
                ) : (
                  premiumLinks.map((l) => (
                    <LinkRow key={l.id} link={l} onDelete={handleDeleteLink} onToggle={handleToggleLink} />
                  ))
                )}
              </div>
            </div>

            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
              <AddLinkForm creatorId={id} onAdded={loadAll} authHeaders={authHeaders} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
