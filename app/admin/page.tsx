"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("charmlink_admin_key");
    if (stored) {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/creators", {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (res.ok || res.status === 200) {
        localStorage.setItem("charmlink_admin_key", key);
        router.push("/admin/dashboard");
      } else if (res.status === 401) {
        setError("Invalid admin key");
      } else {
        setError("Login failed — check server");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">🔗 CharmLink</h1>
          <p className="text-gray-500 text-sm">Admin Dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-gray-400 text-sm mb-2">Admin Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your admin key"
              autoFocus
              className="w-full bg-[#111] border border-[#333] rounded-lg px-4 py-3 text-white
                         placeholder-gray-600 outline-none focus:border-[#e91e8a] transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key}
            className="w-full bg-[#e91e8a] hover:bg-[#d01577] disabled:opacity-50 disabled:cursor-not-allowed
                       text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
