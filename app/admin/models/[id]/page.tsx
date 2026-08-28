"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "../../useAdminAuth";
import { AdminNav } from "../../AdminNav";
import { AvatarCarouselManager } from "../../AvatarCarouselManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

interface ModelSite {
  id: string;
  slug: string;
  custom_domain: string | null;
  is_active: boolean;
  views: number;
  premium_clicks: number;
}

interface ModelRow {
  id: string;
  name: string;
  tagline: string;
  theme_bg: string;
  theme_accent: string;
  theme_text: string;
  avatar_shape: string;
  avatar_border_style: string;
  avatar_border_color_1: string;
  avatar_border_color_2: string;
  avatar_border_color_3: string;
  is_verified: boolean;
  photo_count: number;
  sites: ModelSite[];
}

function ColorInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-input cursor-pointer bg-transparent flex-shrink-0"
        />
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

export default function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready, token, authHeaders } = useAdminAuth();
  const router = useRouter();

  const [model, setModel] = useState<ModelRow | null>(null);
  const [form, setForm] = useState<Partial<ModelRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/models", { headers: authHeaders() });
      if (res.ok) {
        const all: ModelRow[] = await res.json();
        const found = all.find((m) => m.id === id) ?? null;
        setModel(found);
        if (found) setForm(found);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  function setField<K extends keyof ModelRow>(k: K, v: ModelRow[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id, ...form }),
      });
      if (!res.ok) {
        const e = await res.json();
        setError((e as { error?: string }).error ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Model not found.</p>
          <Button variant="ghost" className="mt-3" onClick={() => router.push("/admin/creators")}>
            ← Back to creators
          </Button>
        </main>
      </div>
    );
  }

  const totalViews = model.sites.reduce((n, s) => n + s.views, 0);

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push("/admin/creators")}
              className="text-muted-foreground hover:text-foreground text-sm mb-1"
            >
              ← Creators
            </button>
            <h1 className="text-2xl font-bold">{model.name}</h1>
            <p className="text-muted-foreground text-sm">
              {model.sites.length} {model.sites.length === 1 ? "site" : "sites"} ·{" "}
              {totalViews.toLocaleString()} views combined
            </p>
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </Button>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Photos — shared across every site below */}
        <AvatarCarouselManager
          modelId={id}
          modelSlug={model.sites[0]?.slug ?? ""}
          authHeaders={authHeaders}
          token={token}
        />

        {/* Shared identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Shared identity</CardTitle>
            <CardDescription className="text-xs">
              Applies to every site below. Each domain keeps its own links and slug.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={form.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tagline</Label>
                <Input value={form.tagline ?? ""} onChange={(e) => setField("tagline", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ColorInput label="Background" value={form.theme_bg ?? ""} onChange={(v) => setField("theme_bg", v)} />
              <ColorInput label="Accent" value={form.theme_accent ?? ""} onChange={(v) => setField("theme_accent", v)} />
              <ColorInput label="Text" value={form.theme_text ?? ""} onChange={(v) => setField("theme_text", v)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Frame shape</Label>
                <Select
                  value={form.avatar_shape ?? "circle"}
                  onValueChange={(v) => setField("avatar_shape", v ?? "circle")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="portrait">Portrait (3:4)</SelectItem>
                    <SelectItem value="square">Rounded square</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Border style</Label>
                <Select
                  value={form.avatar_border_style ?? "solid"}
                  onValueChange={(v) => setField("avatar_border_style", v ?? "solid")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="gradient">Gradient (animated)</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Verified badge</Label>
                <p className="text-xs text-muted-foreground">Blue check next to her name</p>
              </div>
              <Switch
                checked={form.is_verified ?? false}
                onCheckedChange={(v) => setField("is_verified", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sites */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sites</CardTitle>
            <CardDescription className="text-xs">
              Each domain has its own premium tracking links — open one to edit them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {model.sites.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.custom_domain ?? `/${s.slug}`}</p>
                  <p className="text-muted-foreground text-xs">
                    /{s.slug} · {s.views.toLocaleString()} views · {s.premium_clicks.toLocaleString()} premium
                  </p>
                </div>
                {!s.is_active && <span className="text-xs text-muted-foreground">inactive</span>}
                <Button size="sm" variant="secondary" onClick={() => router.push(`/admin/creators/${s.id}`)}>
                  Links
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
