"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";

// Platform enforcement log. Every ban, restriction or link block goes here,
// with what changed just before — it is the outcome the bot defences exist to
// prevent, and the only way to learn what actually triggers them.

const PLATFORMS = ["instagram", "facebook", "tiktok", "threads", "x", "other"];
const KINDS: Array<[string, string]> = [
  ["account_banned", "Account banned"],
  ["account_restricted", "Account restricted"],
  ["link_blocked", "Link blocked"],
  ["link_warning", "Link warning / interstitial"],
  ["shadowban", "Shadowban / reach drop"],
  ["content_removed", "Content removed"],
  ["other", "Other"],
];
const KIND_LABEL = Object.fromEntries(KINDS);

interface Creator {
  id: string;
  slug: string;
  name: string;
}

interface Incident {
  id: string;
  occurred_at: string;
  platform: string;
  kind: string;
  creator_id: string | null;
  creator_slug: string | null;
  domain: string | null;
  account_handle: string | null;
  details: string | null;
  recent_changes: string | null;
  resolved_at: string | null;
  resolution: string | null;
  views_per_day_before: number | null;
  views_per_day_after: number | null;
  clicks_per_day_before: number | null;
  clicks_per_day_after: number | null;
}

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmt(n: number | null): string {
  return n === null || n === undefined ? "—" : Number(n).toFixed(1);
}

const inputCls =
  "bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#e91e8a] w-full";

export default function IncidentsPage() {
  const { ready, authHeaders } = useAdminAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    occurred_at: nowLocalInput(),
    platform: "instagram",
    kind: "account_restricted",
    creator_id: "",
    domain: "",
    account_handle: "",
    details: "",
    recent_changes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, cr] = await Promise.all([
        fetch("/api/admin/incidents", { headers: authHeaders(), cache: "no-store" }),
        fetch("/api/admin/creators", { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (inc.ok) setIncidents(await inc.json());
      if (cr.ok) setCreators(await cr.json());
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (ready) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...form, occurred_at: new Date(form.occurred_at).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setForm((f) => ({ ...f, domain: "", account_handle: "", details: "", recent_changes: "", occurred_at: nowLocalInput() }));
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string) {
    const resolution = prompt("How was it resolved? (appeal won, new account, domain swapped…)") ?? "";
    await fetch("/api/admin/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, resolution }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this incident? Only for mistaken entries.")) return;
    await fetch("/api/admin/incidents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Incidents</h1>
          <p className="text-gray-500 text-sm">
            Log every ban, restriction or link block — and what changed just before it. After a few
            entries, patterns (a domain, a creator, a content change, a deploy) become visible.
          </p>
        </div>

        <form onSubmit={submit} className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 mb-6 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-400">
            When
            <input type="datetime-local" className={inputCls} value={form.occurred_at} required
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">
            Platform
            <select className={inputCls} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            What happened
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Creator
            <select className={inputCls} value={form.creator_id} onChange={(e) => setForm({ ...form, creator_id: e.target.value })}>
              <option value="">—</option>
              {creators.map((c) => <option key={c.id} value={c.id}>{c.name || c.slug} ({c.slug})</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Domain in bio / blocked
            <input className={inputCls} placeholder="example.com" value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">
            Account handle
            <input className={inputCls} placeholder="@handle" value={form.account_handle}
              onChange={(e) => setForm({ ...form, account_handle: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400 sm:col-span-2">
            What the platform said
            <textarea className={inputCls} rows={2} value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400 sm:col-span-2">
            What changed shortly before (new domain, new photos, posting spike, bio edit…)
            <textarea className={inputCls} rows={2} value={form.recent_changes}
              onChange={(e) => setForm({ ...form, recent_changes: e.target.value })} />
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm">
              {saving ? "Saving…" : "Log incident"}
            </button>
            {error && <span className="text-red-400 text-sm">{error}</span>}
          </div>
        </form>

        {loading ? (
          <p className="text-gray-500 text-center py-8">Loading…</p>
        ) : incidents.length === 0 ? (
          <p className="text-gray-600 text-center py-10">No incidents logged yet.</p>
        ) : (
          <div className="space-y-3">
            {incidents.map((i) => (
              <div key={i.id} className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-white font-medium">{KIND_LABEL[i.kind] ?? i.kind}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#222] text-gray-300">{i.platform}</span>
                  {i.creator_slug && <span className="text-xs px-2 py-0.5 rounded-full bg-[#222] text-gray-300">{i.creator_slug}</span>}
                  {i.domain && <span className="text-xs px-2 py-0.5 rounded-full bg-[#222] text-gray-300">{i.domain}</span>}
                  {i.account_handle && <span className="text-xs text-gray-400">{i.account_handle}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${i.resolved_at ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                    {i.resolved_at ? "resolved" : "open"}
                  </span>
                  <span className="text-gray-500 text-xs ml-auto">{new Date(i.occurred_at).toLocaleString()}</span>
                </div>
                {i.details && <p className="text-gray-300 text-sm mt-1">{i.details}</p>}
                {i.recent_changes && <p className="text-gray-400 text-sm mt-1"><span className="text-gray-500">Changed before: </span>{i.recent_changes}</p>}
                {i.resolution && <p className="text-green-400 text-sm mt-1">Resolution: {i.resolution}</p>}
                {i.creator_id && (
                  <p className="text-gray-500 text-xs mt-2">
                    Per day, 7d before → 3d after: views {fmt(i.views_per_day_before)} → {fmt(i.views_per_day_after)},
                    premium clicks {fmt(i.clicks_per_day_before)} → {fmt(i.clicks_per_day_after)}
                  </p>
                )}
                <div className="flex gap-3 mt-2">
                  {!i.resolved_at && (
                    <button onClick={() => resolve(i.id)} className="text-xs text-gray-400 hover:text-white">Mark resolved</button>
                  )}
                  <button onClick={() => remove(i.id)} className="text-xs text-red-700 hover:text-red-400">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
