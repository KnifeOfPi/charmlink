"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";
import { CopyButton } from "../CopyButton";

// Resolve the public-facing URL for a creator: custom domain if set, else origin/slug.
function publicUrl(slug: string, customDomain: string | null): string {
  if (customDomain) return `https://${customDomain}`;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/${slug}`;
}

interface ModelSite {
  id: string;
  slug: string;
  custom_domain: string | null;
  is_active: boolean;
  avatar_url: string;
  views: number;
  premium_clicks: number;
}

interface ModelRow {
  id: string;
  name: string;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  photo_count: number;
  sites: ModelSite[];
}

interface CreatorFormData {
  slug: string;
  name: string;
  tagline: string;
  avatar_url: string;
  custom_domain: string;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  is_active: boolean;
}

const defaultForm: CreatorFormData = {
  slug: "",
  name: "",
  tagline: "",
  avatar_url: "",
  custom_domain: "",
  theme_bg: "#0a0a0a",
  theme_accent: "#e91e8a",
  theme_text: "#ffffff",
  is_active: true,
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#333]">
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function CreatorForm({
  initial,
  onSave,
  onCancel,
  loading,
  error,
}: {
  initial: CreatorFormData;
  onSave: (data: CreatorFormData) => void;
  onCancel: () => void;
  loading: boolean;
  error: string;
}) {
  const [form, setForm] = useState<CreatorFormData>(initial);

  function set(key: keyof CreatorFormData, value: string | boolean) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const inputCls = "w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-[#e91e8a] transition-colors";
  const labelCls = "block text-gray-400 text-xs mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Name *</label>
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Holly" />
        </div>
        <div>
          <label className={labelCls}>Slug *</label>
          <input className={inputCls} value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} required placeholder="holly" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Tagline</label>
        <input className={inputCls} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Model & Content Creator ✨" />
      </div>

      <div>
        <label className={labelCls}>Avatar URL</label>
        <input className={inputCls} value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
      </div>

      <div>
        <label className={labelCls}>Custom Domain</label>
        <input className={inputCls} value={form.custom_domain} onChange={(e) => set("custom_domain", e.target.value)} placeholder="holly.example.com" />
      </div>

      <div>
        <label className={labelCls}>Theme Colors</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-gray-600 text-xs mb-1 block">Background</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.theme_bg} onChange={(e) => set("theme_bg", e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[#333]" />
              <input className={inputCls + " !py-1"} value={form.theme_bg} onChange={(e) => set("theme_bg", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-gray-600 text-xs mb-1 block">Accent</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.theme_accent} onChange={(e) => set("theme_accent", e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[#333]" />
              <input className={inputCls + " !py-1"} value={form.theme_accent} onChange={(e) => set("theme_accent", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-gray-600 text-xs mb-1 block">Text</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.theme_text} onChange={(e) => set("theme_text", e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[#333]" />
              <input className={inputCls + " !py-1"} value={form.theme_text} onChange={(e) => set("theme_text", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={form.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
          className="w-4 h-4 accent-[#e91e8a]"
        />
        <label htmlFor="is_active" className="text-gray-400 text-sm">Active (visible to visitors)</label>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {loading ? "Saving..." : "Save Creator"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 border border-[#333] text-gray-400 hover:text-white rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function CreatorsPage() {
  const { ready, authHeaders } = useAdminAuth();
  const router = useRouter();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!ready) return;
    loadCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadCreators() {
    setLoading(true);
    try {
      // One request returns each person with her sites and their traffic
      // already aggregated, so the list does not fan out per site.
      const res = await fetch("/api/admin/models", { headers: authHeaders() });
      if (res.ok) setModels(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(data: CreatorFormData) {
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        ...data,
        custom_domain: data.custom_domain || null,
      };
      const res = await fetch("/api/admin/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowAdd(false);
        loadCreators();
      } else {
        const err = await res.json();
        setFormError(err.error ?? "Failed to create");
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await fetch(`/api/admin/creators/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    loadCreators();
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Creators</h1>
            <p className="text-gray-500 text-sm mt-1">
              {models.length} {models.length === 1 ? "model" : "models"} ·{" "}
              {models.reduce((n, m) => n + m.sites.length, 0)} sites
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#e91e8a] hover:bg-[#d01577] text-white font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <span>+</span> Add Creator
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-center py-16">Loading...</p>
        ) : models.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-4xl mb-3">👤</p>
            <p>No creators yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((m) => {
              const open = expanded.has(m.id);
              const totalViews = m.sites.reduce((n, s) => n + s.views, 0);
              const totalPrem = m.sites.reduce((n, s) => n + s.premium_clicks, 0);
              const cover = m.sites.find((s) => s.avatar_url)?.avatar_url ?? "";
              return (
                <div key={m.id} className="bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden">
                  {/* Model header — the person */}
                  <div
                    onClick={() => toggle(m.id)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#222] transition-colors"
                  >
                    <span className={`text-gray-500 text-xs w-3 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#333] flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 text-xs">{m.name[0]}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">{m.name}</p>
                      <p className="text-gray-500 text-xs">
                        {m.sites.length} {m.sites.length === 1 ? "site" : "sites"}
                        {m.photo_count > 0 && ` · ${m.photo_count} photos`}
                        {totalViews > 0 && ` · ${totalViews.toLocaleString()} views · ${totalPrem.toLocaleString()} premium`}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1">
                      <span className="w-4 h-4 rounded" style={{ background: m.theme_bg, border: "1px solid #444" }} title="Background" />
                      <span className="w-4 h-4 rounded" style={{ background: m.theme_accent }} title="Accent" />
                      <span className="w-4 h-4 rounded" style={{ background: m.theme_text, border: "1px solid #444" }} title="Text" />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/admin/models/${m.id}`); }}
                      className="text-xs bg-[#e91e8a] hover:bg-[#d01577] text-white rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
                      title="Photos, name, tagline and theme for every one of her sites"
                    >
                      Manage
                    </button>
                  </div>

                  {/* Sites — one row per domain, each with its own links */}
                  {open && (
                    <div className="border-t border-[#333]">
                      {m.sites.length === 0 ? (
                        <p className="text-gray-600 text-sm px-4 py-3">No sites assigned yet.</p>
                      ) : m.sites.map((site) => (
                        <div key={site.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#222] last:border-0 hover:bg-[#222] transition-colors">
                          <span className="w-3 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-300 text-sm">
                                {site.custom_domain ?? `/${site.slug}`}
                              </span>
                              <CopyButton value={publicUrl(site.slug, site.custom_domain)} title="Copy public URL" />
                              <a
                                href={publicUrl(site.slug, site.custom_domain)}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs text-gray-500 hover:text-[#e91e8a] border border-[#333] hover:border-[#e91e8a] rounded px-1.5 py-0.5 transition-colors"
                              >
                                Open ↗
                              </a>
                              {!site.is_active && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">Inactive</span>
                              )}
                            </div>
                            <p className="text-gray-600 text-xs mt-0.5">
                              /{site.slug} · {site.views.toLocaleString()} views · {site.premium_clicks.toLocaleString()} premium clicks
                            </p>
                          </div>
                          <button
                            onClick={() => router.push(`/admin/creators/${site.id}`)}
                            className="text-gray-400 hover:text-white text-sm transition-colors px-2 py-1"
                            title="Links and settings for this domain"
                          >
                            Links
                          </button>
                          <button
                            onClick={() => handleDelete(site.id, `${m.name} (${site.custom_domain ?? site.slug})`)}
                            className="text-red-600 hover:text-red-400 text-sm transition-colors px-2 py-1"
                          >
                            Del
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showAdd && (
        <Modal title="Add Creator" onClose={() => setShowAdd(false)}>
          <CreatorForm
            initial={defaultForm}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            loading={formLoading}
            error={formError}
          />
        </Modal>
      )}
    </div>
  );
}
