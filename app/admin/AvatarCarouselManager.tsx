"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Avatar Carousel Manager ───────────────────────────────────────────────────

interface CarouselAvatar {
  id: string;
  url: string;
  is_active: boolean;
  is_pinned: boolean;
  sort_order: number;
  focal_x: number;
  focal_y: number;
  impressions: number;
  premiumClicks: number;
  conversionRate: number;
}

/** Click-to-set crop focus.
 *
 *  The avatar is a circle, so a portrait photo loses its top and bottom. The
 *  default focus sits high to suit selfies, but a photo that breaks that
 *  assumption needs a manual fix, and the fastest way to say "keep this bit" is
 *  to point at it. Clicking the full photo sets the focus; the circle beside it
 *  previews the actual crop the page will render.
 */
function FocalPicker({
  avatar,
  onChange,
}: {
  avatar: CarouselAvatar;
  onChange: (focal: { focal_x: number; focal_y: number }) => void;
}) {
  const [local, setLocal] = useState({ x: avatar.focal_x, y: avatar.focal_y });

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    setLocal({ x, y });
    onChange({ focal_x: x, focal_y: y });
  }

  return (
    <div className="flex gap-3 items-start pt-2">
      <div
        onClick={pick}
        className="relative rounded-md overflow-hidden cursor-crosshair border border-border flex-shrink-0"
        style={{ width: 110 }}
        title="Click the part of the photo to keep centred"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar.url} alt="" className="w-full block" />
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${local.x}%`,
            top: `${local.y}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,.6)",
          }}
        />
      </div>
      <div className="space-y-1">
        <div
          className="rounded-full overflow-hidden border border-border"
          style={{ width: 64, height: 64 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar.url}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `${local.x}% ${local.y}%` }}
          />
        </div>
        <p className="text-muted-foreground text-[10px] leading-tight max-w-[90px]">
          Click photo to re-centre
        </p>
      </div>
    </div>
  );
}

const MAX_AVATARS = 10;
const MAX_PINNED = 3;
// Matches MIN_IMPRESSIONS_FOR_CONFIDENCE in lib/avatar-rotation.ts — below this
// a photo's rate is still noise and the UI says so rather than inviting the
// admin to act on it.
const MIN_IMPRESSIONS = 200;

export function AvatarCarouselManager({
  modelId,
  modelSlug,
  authHeaders,
  token,
}: {
  modelId: string;
  modelSlug: string;
  authHeaders: () => Record<string, string>;
  token: string | null;
}) {
  const [avatars, setAvatars] = useState<CarouselAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/models/${modelId}/avatars`, {
        headers: authHeaders(),
      });
      if (res.ok) setAvatars(await res.json());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_AVATARS - avatars.length;
    if (room <= 0) {
      setError(`Limit is ${MAX_AVATARS} photos. Delete one before adding another.`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const safeSlug =
          modelSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 64) || "unknown";
        const blob = await upload(
          `avatars/${safeSlug}/carousel-${Date.now()}.${ext}`,
          file,
          {
            access: "public",
            handleUploadUrl: "/api/admin/avatar",
            contentType: file.type || undefined,
            headers: token ? { "x-admin-key": token } : {},
          }
        );
        const res = await fetch(`/api/admin/models/${modelId}/avatars`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ url: blob.url }),
        });
        if (!res.ok) {
          const e = await res.json();
          throw new Error((e as { error?: string }).error ?? "Failed to save photo");
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function patch(avatarId: string, fields: Partial<CarouselAvatar>) {
    setError("");
    const res = await fetch(`/api/admin/models/${modelId}/avatars`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ avatarId, ...fields }),
    });
    if (!res.ok) {
      const e = await res.json();
      setError((e as { error?: string }).error ?? "Update failed");
      return;
    }
    await load();
  }

  async function remove(avatarId: string) {
    if (!confirm("Delete this photo? Its past stats stay in analytics but it stops rotating.")) {
      return;
    }
    await fetch(`/api/admin/models/${modelId}/avatars`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ avatarId }),
    });
    await load();
  }

  const pinnedCount = avatars.filter((a) => a.is_pinned).length;
  const rotating = avatars.filter((a) =>
    pinnedCount > 0 ? a.is_pinned && a.is_active : a.is_active
  );
  // Best is only meaningful among photos that have earned enough impressions.
  const ranked = [...avatars]
    .filter((a) => a.impressions >= MIN_IMPRESSIONS)
    .sort((a, b) => b.conversionRate - a.conversionRate);
  const bestId = ranked[0]?.id;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Photo Carousel (A/B test)</CardTitle>
        <CardDescription className="text-xs">
          Up to {MAX_AVATARS} photos. One is picked per visit and its conversions are tracked
          back to it, so better performers automatically earn more traffic — losers keep a
          small share so they can recover if tastes shift.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rotation status */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          {avatars.length === 0 ? (
            <span className="text-muted-foreground">
              No carousel photos — the single Avatar above is used for every visit.
            </span>
          ) : pinnedCount > 0 ? (
            <span>
              <span className="font-medium">{pinnedCount} pinned</span> — rotation is locked to
              your pinned {pinnedCount === 1 ? "photo" : "photos"}. Unpin all to resume testing.
            </span>
          ) : (
            <span>
              <span className="font-medium">Testing {rotating.length}</span>{" "}
              {rotating.length === 1 ? "photo" : "photos"}. Needs {MIN_IMPRESSIONS} views each
              before results are reliable.
            </span>
          )}
        </div>

        {/* Upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleUpload(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          } ${avatars.length >= MAX_AVATARS ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-sm text-muted-foreground">
            {uploading
              ? "Uploading..."
              : avatars.length >= MAX_AVATARS
                ? `Limit reached (${MAX_AVATARS})`
                : `Click or drag photos to add (${avatars.length}/${MAX_AVATARS})`}
          </p>
        </div>

        {error && <p className="text-destructive text-xs">{error}</p>}

        {/* Photo list */}
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="space-y-2">
            {avatars.map((a) => {
              const provisional = a.impressions < MIN_IMPRESSIONS;
              return (
                <div
                  key={a.id}
                  className={`p-2 rounded-lg border ${
                    a.is_active ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"
                  }`}
                >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt="Carousel avatar"
                    className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                    style={{ objectPosition: `${a.focal_x}% ${a.focal_y}%` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tabular-nums">
                        {a.conversionRate}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.premiumClicks} / {a.impressions} views
                      </span>
                      {provisional && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          needs {MIN_IMPRESSIONS - a.impressions} more
                        </Badge>
                      )}
                      {!provisional && a.id === bestId && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-green-600 text-white">
                          best
                        </Badge>
                      )}
                      {a.is_pinned && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-pink-600 text-white">
                          pinned
                        </Badge>
                      )}
                    </div>
                    {/* Conversion bar, scaled to the best performer so the
                        comparison is visual rather than arithmetic. */}
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pink-500"
                        style={{
                          width: `${
                            ranked[0]?.conversionRate
                              ? Math.min(100, (a.conversionRate / ranked[0].conversionRate) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void patch(a.id, { is_pinned: !a.is_pinned })}
                    disabled={!a.is_pinned && pinnedCount >= MAX_PINNED}
                    title={
                      a.is_pinned
                        ? "Unpin"
                        : pinnedCount >= MAX_PINNED
                          ? `At most ${MAX_PINNED} pinned`
                          : "Pin to permanent rotation"
                    }
                    className="text-xs flex-shrink-0 disabled:opacity-30"
                  >
                    {a.is_pinned ? "📌" : "📍"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void patch(a.id, { is_active: !a.is_active })}
                    title={a.is_active ? "Pause" : "Resume"}
                    className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0"
                  >
                    {a.is_active ? "⏸" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a.id)}
                    className="text-destructive hover:text-destructive/70 text-xs flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <FocalPicker
                  avatar={a}
                  onChange={(focal) => void patch(a.id, focal)}
                />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

