# TASK: Port the V2 glassmorphism redesign into the live creator page

You are upgrading the **visual design** of the CharmLink public creator page. This
is a RE-SKIN, not a rewrite. The current page works; it just looks dated.

## Reference design (the look to achieve)
`docs/mockups/creator-v2.html` — a self-contained mockup. Match its aesthetic:
- Dark glassmorphism: frosted-glass link cards (`backdrop-filter: blur`, subtle
  white border, translucent fill).
- Ambient **aurora orbs** in the background (2-3 large blurred, slowly drifting
  color blobs) + very subtle film grain.
- Conic-gradient **spinning avatar ring** with a soft glow.
- A featured/primary link card variant: gradient fill + animated "shine" sweep.
- Glass social-icon row (round, blur, hover lift).
- "Active now" trust pill style.
- Polished 18+ / sensitive modal: blurred scrim, rounded card, two buttons.
- Chevron `›` on cards, hover lift + accent glow.

## File to change
`app/[creator]/CreatorPage.tsx` (the main client component). You may also touch
`app/[creator]/page.tsx` only if strictly needed for wiring. Do NOT change API
routes, middleware, lib/bot-detect, lib/decoy, or anything outside the creator
page rendering.

## NON-NEGOTIABLE — preserve ALL existing functionality and plumbing
Read the current `CreatorPage.tsx` fully first. Keep every one of these working:
1. **Premium-links client-side fetch** (`fetchPremiumLinks`, the `cl-token`
   script tag read, `x-turnstile-token` header path). Links load on mount.
2. **Turnstile challenge** rendering when API returns `turnstile_required`
   (`@marsidev/react-turnstile`). Keep the re-fetch-on-solve flow.
3. **Analytics beacons** — pageview + click tracking (`sendBeacon`, sessionId).
   Every link click must still fire its click event with the same payload shape.
4. **Sensitive / 18+ gate** — the per-link sensitive interstitial behavior.
   Re-style the modal but keep the gating logic and the age-confirm flow intact.
5. **Instagram WebView escape** — the IG banner + iOS `instagram://extbrowser/`
   auto-fire + Chrome/Copy chooser. Keep exactly as-is functionally; light
   restyle OK.
6. **Image link cards** (links with `image_url`) — keep the 16:9 image card
   variant; restyle to match glass aesthetic.
7. **Countdown timer** component — keep working; restyle to glass.
8. **Location pill** ("Visiting from …", ipapi fetch) — keep; restyle to glass.
9. **Badges** (VIP/NEW/HOT etc. via `link.badge`) — keep; match mockup badge style.
10. **All per-link v3 visual overrides** from the data model: `image_url`,
    `badge`, `sensitive`, `show_text_glow`/`text_glow_color`/`text_glow_intensity`,
    `hover_animation`, `border_color`/`show_border`, `title_color`,
    `title_font_size`, `deeplink_enabled`, `recovery_url`, `redirect_url`. These
    must still be respected.
11. **Theme-driven styling** — the page must still read from the `Creator` theme
    fields (`theme.bgColor/accentColor/textColor`, `bg_type`, `bg_gradient_*`,
    `bg_color_2/3`, `avatar_border_*`, `is_verified`, `font` via
    `resolveFontFamily`, `floating_icon*`, `stars*`, `animation_speed`,
    `location_pill_color`). The new aurora background should DERIVE from the
    creator's accent/bg colors (use accentColor + bg colors for the orbs) so each
    creator still looks distinct. If `bg_type`/colors are set, honor them.
    Floating-icon / stars settings can remain supported (gate behind their
    existing flags) but the default polished look is aurora glass.
12. The decoy/bot path is handled server-side (the `isBot` prop) — do not break
    the `isBot` rendering branch.

## Platform-agnostic copy
This will also serve Fansly/Fanvue creators. Do NOT hardcode "OnlyFans" anywhere
in UI text. Keep destination links generic (they come from creator data).

## Quality bar
- Mobile-first (most traffic is IG in-app on phones). Looks great at 390-440px.
- Tasteful motion only; respect `prefers-reduced-motion` (disable orb drift /
  shine / spin when set).
- No new heavy deps. Pure CSS/Tailwind + existing libs. Inline `<style>` for
  keyframes is fine (the file already does this).
- TypeScript must compile clean.

## Definitely do
- `npx tsc --noEmit` (or the project's typecheck) until clean.
- `npm run build` (Next build) and make sure it succeeds.
- Keep the diff focused on `CreatorPage.tsx`.

## When done
Print a concise summary: what changed, confirmation each of the 12 preserved
items still works, and the typecheck/build result.
