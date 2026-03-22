"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "../../useAdminAuth";
import { AdminNav } from "../../AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { THEME_PRESETS, type ThemePreset } from "@/lib/themes";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  // v3
  bg_type: string;
  bg_gradient_type: string;
  bg_gradient_direction: string;
  bg_color_2: string;
  bg_color_3: string | null;
  show_floating_icons: boolean;
  floating_icon: string;
  floating_icon_count: number;
  show_stars: boolean;
  stars_count: number;
  stars_color: string;
  animation_speed: number;
  avatar_border_style: string;
  avatar_border_color_1: string;
  avatar_border_color_2: string;
  avatar_border_color_3: string;
  is_verified: boolean;
  font: string;
  location_pill_color: string | null;
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
  // v3
  show_text_glow: boolean;
  text_glow_color: string;
  text_glow_intensity: number;
  hover_animation: string | null;
  border_color: string | null;
  show_border: boolean;
  title_color: string | null;
  title_font_size: string | null;
  created_at: string;
}

interface AnalyticsSummary {
  totalViews: number;
  humanViews: number;
  premiumClicks: number;
  ctr: number;
}

// ── Color Input ───────────────────────────────────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}

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

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-opacity ${
        link.is_active ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"
      }`}
    >
      <span className="text-base w-6 text-center flex-shrink-0 mt-0.5">{icons[link.icon] ?? "🔗"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{link.label}</p>
          {link.badge && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {link.badge}
            </Badge>
          )}
          {link.sensitive && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">sensitive</Badge>
          )}
          {link.deeplink_enabled && (
            <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white">deeplink</Badge>
          )}
          {link.show_text_glow && (
            <Badge className="text-[10px] px-1.5 py-0 bg-purple-600 text-white">glow</Badge>
          )}
          {link.hover_animation && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-600 text-white">{link.hover_animation}</Badge>
          )}
        </div>
        {link.subtitle && <p className="text-muted-foreground text-xs mt-0.5 truncate">{link.subtitle}</p>}
        <p className="text-muted-foreground/60 text-xs truncate">{link.url}</p>
      </div>
      <Badge
        variant={link.link_type === "premium" ? "default" : "secondary"}
        className="flex-shrink-0 text-xs"
      >
        {link.link_type}
      </Badge>
      <button
        onClick={() => onToggle(link.id, !link.is_active)}
        className="text-muted-foreground hover:text-foreground text-xs transition-colors flex-shrink-0"
        title={link.is_active ? "Deactivate" : "Activate"}
      >
        {link.is_active ? "⏸" : "▶"}
      </button>
      <button
        onClick={() => onDelete(link.id)}
        className="text-destructive hover:text-destructive/70 text-xs transition-colors flex-shrink-0"
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
    badge: "",
    notes: "",
    tags: "",
    // v3
    show_text_glow: false,
    text_glow_color: "#ffffff",
    text_glow_intensity: 5,
    hover_animation: "",
    border_color: "",
    show_border: false,
    title_color: "",
    title_font_size: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [expandedV3, setExpandedV3] = useState(false);

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
        show_text_glow: form.show_text_glow,
        text_glow_color: form.text_glow_color,
        text_glow_intensity: form.text_glow_intensity,
        hover_animation: form.hover_animation || null,
        border_color: form.border_color || null,
        show_border: form.show_border,
        title_color: form.title_color || null,
        title_font_size: form.title_font_size || null,
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
          show_text_glow: false, text_glow_color: "#ffffff", text_glow_intensity: 5,
          hover_animation: "", border_color: "", show_border: false,
          title_color: "", title_font_size: "",
        });
        setExpanded(false);
        setExpandedV3(false);
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Add Link</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Input
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            required
            placeholder="Twitter"
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Icon</Label>
          <Select value={form.icon} onValueChange={(v) => setForm((p) => ({ ...p, icon: v ?? "link" }))}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="link">🔗 Link</SelectItem>
              <SelectItem value="twitter">𝕏 Twitter</SelectItem>
              <SelectItem value="tiktok">♪ TikTok</SelectItem>
              <SelectItem value="instagram">📸 Instagram</SelectItem>
              <SelectItem value="youtube">▶ YouTube</SelectItem>
              <SelectItem value="star">⭐ Star</SelectItem>
              <SelectItem value="crown">👑 Crown</SelectItem>
              <SelectItem value="heart">💖 Heart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">URL</Label>
        <Input
          value={form.url}
          onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
          required
          placeholder="https://..."
          type="url"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={form.link_type}
            onValueChange={(v) => setForm((p) => ({ ...p, link_type: v as "social" | "premium" }))}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="social">Social</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Badge</Label>
          <Select value={form.badge} onValueChange={(v) => setForm((p) => ({ ...p, badge: v ?? "" }))}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              <SelectItem value="new">🟢 New</SelectItem>
              <SelectItem value="popular">🟠 Popular</SelectItem>
              <SelectItem value="exclusive">🟣 Exclusive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Subtitle</Label>
        <Input
          value={form.subtitle}
          onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
          placeholder="Secondary text"
          className="text-sm"
        />
      </div>

      {/* Advanced options toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground text-xs transition-colors w-full text-left"
      >
        {expanded ? "▲ Hide advanced" : "▼ Show advanced"}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Image URL (card style)</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Redirect URL</Label>
            <Input
              value={form.redirect_url}
              onChange={(e) => setForm((p) => ({ ...p, redirect_url: e.target.value }))}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recovery URL (deeplink fallback)</Label>
            <Input
              value={form.recovery_url}
              onChange={(e) => setForm((p) => ({ ...p, recovery_url: e.target.value }))}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.sensitive}
                onCheckedChange={(v) => setForm((p) => ({ ...p, sensitive: v }))}
              />
              <Label className="text-xs">Sensitive</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.deeplink_enabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, deeplink_enabled: v }))}
              />
              <Label className="text-xs">Deeplink</Label>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (admin only)</Label>
            <textarea
              className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 placeholder-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Internal notes..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="promo, featured, seasonal"
              className="text-sm"
            />
          </div>
        </div>
      )}

      {/* V3 Visual options */}
      <button
        type="button"
        onClick={() => setExpandedV3(!expandedV3)}
        className="text-muted-foreground hover:text-foreground text-xs transition-colors w-full text-left"
      >
        {expandedV3 ? "▲ Hide visual options" : "✨ Show visual options"}
      </button>

      {expandedV3 && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* Text glow */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.show_text_glow}
                onCheckedChange={(v) => setForm((p) => ({ ...p, show_text_glow: v }))}
              />
              <Label className="text-xs">Text Glow</Label>
            </div>
          </div>
          {form.show_text_glow && (
            <div className="grid grid-cols-2 gap-2">
              <ColorInput
                label="Glow Color"
                value={form.text_glow_color}
                onChange={(v) => setForm((p) => ({ ...p, text_glow_color: v }))}
              />
              <div className="space-y-1">
                <Label className="text-xs">Intensity (1-10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.text_glow_intensity}
                  onChange={(e) => setForm((p) => ({ ...p, text_glow_intensity: Number(e.target.value) }))}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {/* Hover animation */}
          <div className="space-y-1">
            <Label className="text-xs">Hover Animation</Label>
            <Select
              value={form.hover_animation || "none"}
              onValueChange={(v) => setForm((p) => ({ ...p, hover_animation: !v || v === "none" ? "" : v }))}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="pulse">Pulse</SelectItem>
                <SelectItem value="bounce">Bounce</SelectItem>
                <SelectItem value="shake">Shake</SelectItem>
                <SelectItem value="glow">Glow</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Border */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.show_border}
              onCheckedChange={(v) => setForm((p) => ({ ...p, show_border: v }))}
            />
            <Label className="text-xs">Show Border</Label>
          </div>
          {form.show_border && (
            <ColorInput
              label="Border Color"
              value={form.border_color}
              onChange={(v) => setForm((p) => ({ ...p, border_color: v }))}
            />
          )}

          {/* Title overrides */}
          <div className="grid grid-cols-2 gap-2">
            <ColorInput
              label="Title Color (override)"
              value={form.title_color}
              onChange={(v) => setForm((p) => ({ ...p, title_color: v }))}
            />
            <div className="space-y-1">
              <Label className="text-xs">Title Font Size</Label>
              <Select
                value={form.title_font_size || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, title_font_size: !v || v === "none" ? "" : v }))}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="xl">XL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Adding..." : "Add Link"}
      </Button>
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
      const payload = { ...form, custom_domain: form.custom_domain || null };
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
        setDomainStatus((data as { verified?: boolean }).verified ? "✅ Verified" : "⏳ Added — awaiting DNS");
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
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="text-muted-foreground text-center py-16">Loading...</div>
      </div>
    );
  }
  if (!creator) return null;

  const socialLinks = links.filter((l) => l.link_type === "social");
  const premiumLinks = links.filter((l) => l.link_type === "premium");

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-bold">{creator.name}</h1>
            <p className="text-muted-foreground text-sm">/{creator.slug}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {creator.is_verified && (
              <Badge className="bg-blue-600 text-white">✓ Verified</Badge>
            )}
            <Badge variant={creator.is_active ? "default" : "secondary"}>
              {creator.is_active ? "Active" : "Inactive"}
            </Badge>
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
              <Card key={s.label}>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column: Edit form ── */}
          <div>
            <form onSubmit={handleSave}>
              <Tabs defaultValue="profile" className="space-y-4">
                <TabsList className="w-full grid grid-cols-5 text-xs">
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="theme">Theme</TabsTrigger>
                  <TabsTrigger value="effects">Effects</TabsTrigger>
                  <TabsTrigger value="avatar">Avatar</TabsTrigger>
                  <TabsTrigger value="misc">Misc</TabsTrigger>
                </TabsList>

                {/* ── Profile Tab ── */}
                <TabsContent value="profile">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Profile</CardTitle>
                      <CardDescription className="text-xs">Basic info shown on the creator page</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Name</Label>
                          <Input
                            value={form.name ?? ""}
                            onChange={(e) => setField("name", e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Slug</Label>
                          <Input
                            value={form.slug ?? ""}
                            onChange={(e) => setField("slug", e.target.value.toLowerCase())}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Tagline</Label>
                        <Input
                          value={form.tagline ?? ""}
                          onChange={(e) => setField("tagline", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Avatar URL</Label>
                        <Input
                          value={form.avatar_url ?? ""}
                          onChange={(e) => setField("avatar_url", e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Custom Domain</Label>
                        <div className="flex gap-2">
                          <Input
                            value={form.custom_domain ?? ""}
                            onChange={(e) => setField("custom_domain", e.target.value || null)}
                            placeholder="holly.example.com"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleAddToVercel}
                            disabled={!form.custom_domain || addingDomain}
                            className="flex-shrink-0 text-xs"
                          >
                            {addingDomain ? "..." : "Add to Vercel"}
                          </Button>
                        </div>
                        {domainStatus && <p className="text-xs mt-1 text-muted-foreground">{domainStatus}</p>}
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Behavior</p>
                        <div className="flex items-center justify-between">
                          <Label className="font-normal">Active (visible)</Label>
                          <Switch
                            checked={form.is_active ?? true}
                            onCheckedChange={(v) => setField("is_active", v)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="font-normal">Sensitive default</Label>
                          <Switch
                            checked={form.sensitive_default ?? false}
                            onCheckedChange={(v) => setField("sensitive_default", v)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Theme Tab ── */}
                <TabsContent value="theme">
                  {/* Theme Presets */}
                  <Card className="mb-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">🎨 Theme Presets</CardTitle>
                      <CardDescription className="text-xs">One-click themes — or customize manually below</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {THEME_PRESETS.map((preset: ThemePreset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-colors text-center"
                            title={preset.description}
                            onClick={() => {
                              const s = preset.settings;
                              setForm((prev) => ({
                                ...prev,
                                theme_bg: s.theme_bg,
                                theme_accent: s.theme_accent,
                                theme_text: s.theme_text,
                                bg_type: s.bg_type,
                                bg_gradient_type: s.bg_gradient_type,
                                bg_gradient_direction: s.bg_gradient_direction,
                                bg_color_2: s.bg_color_2,
                                bg_color_3: s.bg_color_3,
                                show_floating_icons: s.show_floating_icons,
                                floating_icon: s.floating_icon,
                                floating_icon_count: s.floating_icon_count,
                                show_stars: s.show_stars,
                                stars_count: s.stars_count,
                                stars_color: s.stars_color,
                                animation_speed: s.animation_speed,
                                avatar_border_style: s.avatar_border_style,
                                avatar_border_color_1: s.avatar_border_color_1,
                                avatar_border_color_2: s.avatar_border_color_2,
                                avatar_border_color_3: s.avatar_border_color_3,
                                font: s.font,
                              }));
                            }}
                          >
                            <span className="text-xl">{preset.preview}</span>
                            <span className="text-[10px] font-medium leading-tight">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">Click a preset then hit Save. You can still tweak individual settings below.</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Theme & Background</CardTitle>
                      <CardDescription className="text-xs">Colors, gradients, and background type</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <ColorInput
                          label="Background"
                          value={form.theme_bg ?? "#0a0a0a"}
                          onChange={(v) => setField("theme_bg", v)}
                        />
                        <ColorInput
                          label="Accent"
                          value={form.theme_accent ?? "#e91e8a"}
                          onChange={(v) => setField("theme_accent", v)}
                        />
                        <ColorInput
                          label="Text"
                          value={form.theme_text ?? "#ffffff"}
                          onChange={(v) => setField("theme_text", v)}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-1">
                        <Label>Background Type</Label>
                        <Select
                          value={form.bg_type ?? "solid"}
                          onValueChange={(v) => setField("bg_type", v ?? "solid")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solid">Solid Color</SelectItem>
                            <SelectItem value="gradient">Gradient</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {form.bg_type === "gradient" && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label>Gradient Type</Label>
                              <Select
                                value={form.bg_gradient_type ?? "linear"}
                                onValueChange={(v) => setField("bg_gradient_type", v ?? "linear")}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="linear">Linear</SelectItem>
                                  <SelectItem value="radial">Radial</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {form.bg_gradient_type !== "radial" && (
                              <div className="space-y-1">
                                <Label>Direction</Label>
                                <Select
                                  value={form.bg_gradient_direction ?? "to bottom"}
                                  onValueChange={(v) => setField("bg_gradient_direction", v ?? "to bottom")}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="to bottom">↓ To Bottom</SelectItem>
                                    <SelectItem value="to top">↑ To Top</SelectItem>
                                    <SelectItem value="to right">→ To Right</SelectItem>
                                    <SelectItem value="to left">← To Left</SelectItem>
                                    <SelectItem value="to bottom right">↘ Diagonal</SelectItem>
                                    <SelectItem value="135deg">135°</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <ColorInput
                              label="Color 2"
                              value={form.bg_color_2 ?? "#1a1a2e"}
                              onChange={(v) => setField("bg_color_2", v)}
                            />
                            <ColorInput
                              label="Color 3 (optional)"
                              value={form.bg_color_3 ?? ""}
                              onChange={(v) => setField("bg_color_3", v || null)}
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Effects Tab ── */}
                <TabsContent value="effects">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Background Effects</CardTitle>
                      <CardDescription className="text-xs">Floating icons and star particles</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Floating Icons */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Floating Icons</Label>
                            <p className="text-xs text-muted-foreground">Emoji floating up from the bottom</p>
                          </div>
                          <Switch
                            checked={form.show_floating_icons ?? false}
                            onCheckedChange={(v) => setField("show_floating_icons", v)}
                          />
                        </div>
                        {form.show_floating_icons && (
                          <div className="grid grid-cols-3 gap-3 pl-2 border-l-2 border-border">
                            <div className="space-y-1">
                              <Label className="text-xs">Emoji</Label>
                              <Input
                                value={form.floating_icon ?? "💫"}
                                onChange={(e) => setField("floating_icon", e.target.value)}
                                className="text-xl text-center"
                                maxLength={2}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Count</Label>
                              <Input
                                type="number"
                                min={1}
                                max={30}
                                value={form.floating_icon_count ?? 8}
                                onChange={(e) => setField("floating_icon_count", Number(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Speed (s)</Label>
                              <Input
                                type="number"
                                min={3}
                                max={30}
                                value={form.animation_speed ?? 10}
                                onChange={(e) => setField("animation_speed", Number(e.target.value))}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Star Particles */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Star Particles</Label>
                            <p className="text-xs text-muted-foreground">Twinkling star dots on the background</p>
                          </div>
                          <Switch
                            checked={form.show_stars ?? false}
                            onCheckedChange={(v) => setField("show_stars", v)}
                          />
                        </div>
                        {form.show_stars && (
                          <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-border">
                            <div className="space-y-1">
                              <Label className="text-xs">Star Count</Label>
                              <Input
                                type="number"
                                min={5}
                                max={200}
                                value={form.stars_count ?? 50}
                                onChange={(e) => setField("stars_count", Number(e.target.value))}
                              />
                            </div>
                            <ColorInput
                              label="Star Color"
                              value={form.stars_color ?? "#ffffff"}
                              onChange={(v) => setField("stars_color", v)}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Avatar Tab ── */}
                <TabsContent value="avatar">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Avatar & Identity</CardTitle>
                      <CardDescription className="text-xs">Border style, verified badge</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1">
                        <Label>Border Style</Label>
                        <Select
                          value={form.avatar_border_style ?? "solid"}
                          onValueChange={(v) => setField("avatar_border_style", v ?? "solid")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solid">Solid</SelectItem>
                            <SelectItem value="gradient">Gradient (animated)</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {form.avatar_border_style !== "none" && (
                        <div className="grid grid-cols-3 gap-3">
                          <ColorInput
                            label={form.avatar_border_style === "gradient" ? "Color 1" : "Border Color"}
                            value={form.avatar_border_color_1 ?? "#ffffff"}
                            onChange={(v) => setField("avatar_border_color_1", v)}
                          />
                          {form.avatar_border_style === "gradient" && (
                            <>
                              <ColorInput
                                label="Color 2"
                                value={form.avatar_border_color_2 ?? "#f472b6"}
                                onChange={(v) => setField("avatar_border_color_2", v)}
                              />
                              <ColorInput
                                label="Color 3"
                                value={form.avatar_border_color_3 ?? "#fda4af"}
                                onChange={(v) => setField("avatar_border_color_3", v)}
                              />
                            </>
                          )}
                        </div>
                      )}

                      <Separator />

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Verified Badge</Label>
                          <p className="text-xs text-muted-foreground">Shows blue checkmark next to name</p>
                        </div>
                        <Switch
                          checked={form.is_verified ?? false}
                          onCheckedChange={(v) => setField("is_verified", v)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Misc Tab ── */}
                <TabsContent value="misc">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Font & Location</CardTitle>
                      <CardDescription className="text-xs">Typography and visitor location display</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1">
                        <Label>Font Family</Label>
                        <Select
                          value={form.font ?? "inter"}
                          onValueChange={(v) => setField("font", v ?? "inter")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inter">Inter (default)</SelectItem>
                            <SelectItem value="poppins">Poppins</SelectItem>
                            <SelectItem value="playfair">Playfair Display</SelectItem>
                            <SelectItem value="roboto">Roboto</SelectItem>
                            <SelectItem value="montserrat">Montserrat</SelectItem>
                            <SelectItem value="dancing-script">Dancing Script</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Show Visitor Location</Label>
                            <p className="text-xs text-muted-foreground">IP geolocation pill above avatar</p>
                          </div>
                          <Switch
                            checked={form.show_location ?? false}
                            onCheckedChange={(v) => setField("show_location", v)}
                          />
                        </div>
                        {form.show_location && (
                          <div className="space-y-3 pl-2 border-l-2 border-border">
                            <div className="space-y-1">
                              <Label className="text-xs">Location Type</Label>
                              <Select
                                value={form.location_type ?? "ip_auto"}
                                onValueChange={(v) => setField("location_type", v ?? "ip_auto")}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ip_auto">Auto (IP geolocation)</SelectItem>
                                  <SelectItem value="manual">Manual</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <ColorInput
                              label="Pill Background Color"
                              value={form.location_pill_color ?? ""}
                              onChange={(v) => setField("location_pill_color", v || null)}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {saveError && <p className="text-destructive text-sm mt-3">{saveError}</p>}
              {saveSuccess && <p className="text-green-500 text-sm mt-3">✓ Saved successfully</p>}

              <Button type="submit" disabled={saving} className="w-full mt-4">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </div>

          {/* ── Right column: Links ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Social Links
                  <Badge variant="secondary" className="ml-2">{socialLinks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {socialLinks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No social links yet</p>
                ) : (
                  socialLinks.map((l) => (
                    <LinkRow key={l.id} link={l} onDelete={handleDeleteLink} onToggle={handleToggleLink} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Premium Links
                  <Badge variant="secondary" className="ml-2">{premiumLinks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {premiumLinks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No premium links yet</p>
                ) : (
                  premiumLinks.map((l) => (
                    <LinkRow key={l.id} link={l} onDelete={handleDeleteLink} onToggle={handleToggleLink} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Link</CardTitle>
              </CardHeader>
              <CardContent>
                <AddLinkForm creatorId={id} onAdded={loadAll} authHeaders={authHeaders} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
