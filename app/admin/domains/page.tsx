"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";

interface VercelDomain {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
  createdAt?: number;
  // UI-only health state (probed client-side after load)
  health?: "unknown" | "healthy" | "broken" | "probing";
  healthStatus?: number | null;
  healing?: boolean;
  healMessage?: string;
}

interface HealResponse {
  domain: string;
  ok: boolean;
  noop?: boolean;
  preStatus?: number | null;
  postStatus?: number | null;
  healthy?: boolean;
  message?: string;
  error?: string;
  steps?: Array<{ name: string; ok: boolean; detail?: string }>;
}

export default function DomainsPage() {
  const { ready, authHeaders } = useAdminAuth();
  const [domains, setDomains] = useState<VercelDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Probe domain health after load so we can show the Heal button on broken rows.
  // Uses the public site directly (HEAD) — no admin auth needed, no extra route.
  async function probeDomainHealth(name: string): Promise<{ healthy: boolean; status: number | null }> {
    try {
      const res = await fetch(`https://${name}/`, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
      // no-cors gives us an opaque response — status is always 0. Falling through
      // to the catch below means the request errored (network/TLS/525). Reaching
      // here means the fetch resolved, which means TLS handshake + HTTP completed.
      return { healthy: true, status: res.status || 200 };
    } catch {
      return { healthy: false, status: null };
    }
  }

  async function probeAllDomains(items: VercelDomain[]) {
    const results = await Promise.all(
      items.map(async (d) => {
        const probe = await probeDomainHealth(d.name);
        return {
          ...d,
          health: probe.healthy ? ("healthy" as const) : ("broken" as const),
          healthStatus: probe.status,
        };
      })
    );
    setDomains(results);
  }

  useEffect(() => {
    if (!ready) return;
    loadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function loadDomains() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/domains/status", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const items: VercelDomain[] = Array.isArray(data)
          ? data.map((d: VercelDomain) => ({ ...d, health: "probing" as const }))
          : [];
        setDomains(items);
        // Kick off health probes in the background — don't block the UI.
        if (items.length > 0) {
          probeAllDomains(items);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleHeal(domain: string) {
    // Optimistic UI — mark as healing immediately
    setDomains((prev) =>
      prev.map((d) =>
        d.name === domain ? { ...d, healing: true, healMessage: "Healing… (up to 3 min)" } : d
      )
    );
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/domains/heal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ domain }),
      });
      const data: HealResponse = await res.json();

      if (!res.ok) {
        setDomains((prev) =>
          prev.map((d) =>
            d.name === domain
              ? {
                  ...d,
                  healing: false,
                  healMessage: `❌ ${data.error ?? "heal failed"}`,
                }
              : d
          )
        );
        setError(`${domain}: ${data.error ?? "heal failed"}`);
        return;
      }

      if (data.noop) {
        setDomains((prev) =>
          prev.map((d) =>
            d.name === domain
              ? { ...d, healing: false, health: "healthy", healMessage: "✅ already healthy" }
              : d
          )
        );
        setSuccess(`${domain} was already healthy`);
        return;
      }

      // Re-probe to confirm
      const probe = await probeDomainHealth(domain);
      setDomains((prev) =>
        prev.map((d) =>
          d.name === domain
            ? {
                ...d,
                healing: false,
                health: probe.healthy ? "healthy" : "broken",
                healthStatus: probe.status ?? data.postStatus ?? null,
                healMessage: data.ok
                  ? "✅ healed"
                  : `⚠️ partial heal — HTTP ${data.postStatus ?? "?"}`,
              }
            : d
        )
      );
      if (data.ok) {
        setSuccess(`✅ ${domain} healed`);
      } else {
        setError(`${domain}: still broken after heal (HTTP ${data.postStatus ?? "?"})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setDomains((prev) =>
        prev.map((d) =>
          d.name === domain ? { ...d, healing: false, healMessage: `❌ ${msg}` } : d
        )
      );
      setError(`${domain}: ${msg}`);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`✅ ${newDomain} added to Vercel`);
        setNewDomain("");
        loadDomains();
      } else {
        setError(data.error ?? "Failed to add domain");
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(domain: string) {
    if (!confirm(`Remove ${domain} from Vercel?`)) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ domain }),
      });
      if (res.ok) {
        setSuccess(`✅ ${domain} removed`);
        loadDomains();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed");
      }
    } catch {
      setError("Network error");
    }
  }

  async function checkStatus(domain: string) {
    const res = await fetch(`/api/admin/domains/status?domain=${encodeURIComponent(domain)}`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data: VercelDomain = await res.json();
      setDomains((prev) => prev.map((d) => (d.name === domain ? { ...d, ...data } : d)));
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Domains</h1>
          <p className="text-gray-500 text-sm">Manage custom domains via Vercel</p>
        </div>

        {/* Add domain */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Add Custom Domain</h2>
          <form onSubmit={handleAdd} className="flex gap-3">
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="holly.example.com"
              className="flex-1 bg-[#111] border border-[#333] rounded-lg px-4 py-2.5 text-white
                         placeholder-gray-600 outline-none focus:border-[#e91e8a] text-sm transition-colors"
            />
            <button
              type="submit"
              disabled={adding || !newDomain.trim()}
              className="bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white font-semibold
                         px-5 py-2.5 rounded-lg transition-colors flex-shrink-0"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {success && <p className="text-green-400 text-sm mt-2">{success}</p>}
        </div>

        {/* DNS instructions */}
        <div className="bg-[#111] border border-[#222] rounded-xl p-4 mb-6">
          <p className="text-gray-400 text-sm font-semibold mb-2">DNS Configuration</p>
          <p className="text-gray-600 text-xs mb-2">Point your domain to Vercel by adding these DNS records:</p>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex gap-4">
              <span className="text-gray-500 w-12">Type</span>
              <span className="text-gray-500 w-24">Name</span>
              <span className="text-gray-500">Value</span>
            </div>
            <div className="flex gap-4">
              <span className="text-blue-400 w-12">A</span>
              <span className="text-white w-24">@</span>
              <span className="text-green-400">76.76.21.21</span>
            </div>
            <div className="flex gap-4">
              <span className="text-blue-400 w-12">CNAME</span>
              <span className="text-white w-24">www</span>
              <span className="text-green-400">cname.vercel-dns.com</span>
            </div>
          </div>
        </div>

        {/* Domain list */}
        {loading ? (
          <p className="text-gray-500 text-center py-8">Loading...</p>
        ) : domains.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <p className="text-3xl mb-2">🌐</p>
            <p>No domains added yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => (
              <div key={domain.name} className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${domain.verified ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
                    <div>
                      <p className="text-white font-medium">{domain.name}</p>
                      {domain.apexName !== domain.name && (
                        <p className="text-gray-500 text-xs">Apex: {domain.apexName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${domain.verified ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
                      {domain.verified ? "Verified" : "Pending"}
                    </span>
                    {domain.health === "broken" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">
                        SSL broken
                      </span>
                    )}
                    {domain.health === "broken" && (
                      <button
                        onClick={() => handleHeal(domain.name)}
                        disabled={domain.healing}
                        className="bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 text-white font-semibold text-xs px-3 py-1 rounded-lg transition-colors"
                        title="Re-run the cf-heal flow: unproxy → wait for Vercel cert → re-proxy"
                      >
                        {domain.healing ? "Healing…" : "🩹 Heal"}
                      </button>
                    )}
                    <button
                      onClick={() => checkStatus(domain.name)}
                      className="text-gray-500 hover:text-white text-xs transition-colors px-2"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={() => handleRemove(domain.name)}
                      className="text-red-700 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {!domain.verified && domain.verification && domain.verification.length > 0 && (
                  <div className="mt-3 p-3 bg-[#111] rounded-lg">
                    <p className="text-yellow-400 text-xs font-semibold mb-2">Add this TXT record to verify:</p>
                    {domain.verification.map((v, i) => (
                      <div key={i} className="font-mono text-xs space-y-0.5">
                        <div className="flex gap-3">
                          <span className="text-gray-500 w-12">Type:</span>
                          <span className="text-white">{v.type}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-gray-500 w-12">Name:</span>
                          <span className="text-white break-all">{v.domain}</span>
                        </div>
                        <div className="flex gap-3">
                          <span className="text-gray-500 w-12">Value:</span>
                          <span className="text-green-400 break-all">{v.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {domain.healMessage && (
                  <p
                    className={`text-xs mt-2 ${
                      domain.healMessage.startsWith("✅")
                        ? "text-green-400"
                        : domain.healMessage.startsWith("⚠️")
                          ? "text-yellow-400"
                          : domain.healMessage.startsWith("❌")
                            ? "text-red-400"
                            : "text-gray-400"
                    }`}
                  >
                    {domain.healMessage}
                  </p>
                )}

                {domain.createdAt && (
                  <p className="text-gray-700 text-xs mt-2">
                    Added {new Date(domain.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
