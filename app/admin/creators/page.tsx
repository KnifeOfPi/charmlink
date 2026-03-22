"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";

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
  const [creators, setCreators] = useState<DBCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!ready) return;
    loadCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function loadCreators() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/creators", { headers: authHeaders() });
      if (res.ok) {
        setCreators(await res.json());
      }
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
            <p className="text-gray-500 text-sm mt-1">{creators.length} creator{creators.length !== 1 ? "s" : ""}</p>
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
        ) : creators.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-4xl mb-3">👤</p>
            <p>No creators yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-4 py-3">Creator</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-4 py-3 hidden md:table-cell">Domain</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Theme</th>
                  <th className="text-left text-gray-500 text-xs uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-right text-gray-500 text-xs uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((creator) => (
                  <tr key={creator.id} className="border-b border-[#222] last:border-0 hover:bg-[#222] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {creator.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={creator.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-xs">{creator.name[0]}</span>
                          </div>
                        )}
                        <div>
                          <p className="text-white text-sm font-medium">{creator.name}</p>
                          <p className="text-gray-500 text-xs">/{creator.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-gray-400 text-sm">
                        {creator.custom_domain ?? <span className="text-gray-700">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        <span className="w-4 h-4 rounded" style={{ background: creator.theme_bg, border: "1px solid #444" }} title="Background" />
                        <span className="w-4 h-4 rounded" style={{ background: creator.theme_accent }} title="Accent" />
                        <span className="w-4 h-4 rounded" style={{ background: creator.theme_text, border: "1px solid #444" }} title="Text" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${creator.is_active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                        {creator.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => router.push(`/admin/creators/${creator.id}`)}
                          className="text-gray-400 hover:text-white text-sm transition-colors px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(creator.id, creator.name)}
                          className="text-red-600 hover:text-red-400 text-sm transition-colors px-2 py-1"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
