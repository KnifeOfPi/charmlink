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
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${link.is_active ? "border-[#333] bg-[#111]" : "border-[#222] bg-[#0d0d0d] opacity-60"}`}>
      <span className="text-base w-6 text-center flex-shrink-0">{icons[link.icon] ?? "🔗"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{link.label}</p>
        <p className="text-gray-500 text-xs truncate">{link.url}</p>
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

interface AddLinkFormProps {
  creatorId: string;
  onAdded: () => void;
  authHeaders: () => Record<string, string>;
}

function AddLinkForm({ creatorId, onAdded, authHeaders }: AddLinkFormProps) {
  const [form, setForm] = useState({ label: "", url: "", icon: "link", link_type: "social" as "social" | "premium" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ label: "", url: "", icon: "link", link_type: "social" });
        onAdded();
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-[#111] border border-[#333] rounded-lg space-y-2">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Add Link</p>
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
      <div>
        <label className={labelCls}>Type</label>
        <select
          className={inputCls}
          value={form.link_type}
          onChange={(e) => setForm((p) => ({ ...p, link_type: e.target.value as "social" | "premium" }))}
        >
          <option value="social">Social</option>
          <option value="premium">Premium (OF/Fanvue)</option>
        </select>
      </div>
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

  // Form state (mirrors creator fields)
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

        // Load analytics in background
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
        setSaveError(err.error ?? "Failed to save");
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
        setDomainStatus(data.verified ? "✅ Verified" : "⏳ Added — awaiting DNS verification");
      } else {
        setDomainStatus(`❌ ${data.error}`);
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
          <div>
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

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active ?? true}
                    onChange={(e) => setField("is_active", e.target.checked)}
                    className="w-4 h-4 accent-[#e91e8a]"
                  />
                  <label htmlFor="is_active" className="text-gray-400 text-sm">Active</label>
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
