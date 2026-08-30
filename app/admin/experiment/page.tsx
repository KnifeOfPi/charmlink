"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";
import { ExperimentDashboard } from "./ExperimentDashboard";
import type { EscapeExperimentArm, EscapeExperimentDaily } from "../../../lib/db";

interface ExperimentPayload {
  slug: string;
  start: string;
  enabled: boolean;
  arms: EscapeExperimentArm[];
  daily: EscapeExperimentDaily[];
}

export default function ExperimentPage() {
  const { ready, authHeaders } = useAdminAuth();
  const [data, setData] = useState<ExperimentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/analytics/experiment", { headers: authHeaders() });
      if (res.ok) setData(await res.json());
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!ready) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      {loading ? (
        <div className="text-gray-500 text-center py-16">Loading split test…</div>
      ) : failed || !data ? (
        <div className="text-center py-16">
          <p className="text-gray-500">Could not load the split test.</p>
          <button
            onClick={() => void load()}
            className="mt-3 text-sm text-pink-400 hover:text-pink-300 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : (
        <ExperimentDashboard
          slug={data.slug}
          start={data.start}
          enabled={data.enabled}
          arms={data.arms}
          daily={data.daily}
        />
      )}
    </div>
  );
}
