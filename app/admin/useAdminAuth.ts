"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAdminAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("charmlink_admin_key");
    if (!stored) {
      router.replace("/admin");
      return;
    }
    setToken(stored);
    setReady(true);
  }, [router]);

  function authHeaders(): Record<string, string> {
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  return { token, ready, authHeaders };
}
