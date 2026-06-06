# SOP — Setting Up a Spotlight Landing Page

**Who this is for:** Managers setting up a creator's link-in-bio page.
**Time needed:** ~5–10 minutes once you have the creator's photos + links.
**Goal:** Build a "Spotlight" style landing page (the link.me-style layout: big hero photo, featured content card, photo gallery).

---

## Before You Start — Gather These Assets

Collect from the creator (or their content folder) **before** opening the admin:

1. **Profile photo** (square works best) — for the avatar.
2. **Hero image** — a wide/tall banner photo shown big at the top. Use their best vertical shot.
3. **Featured card image** — one standout photo for the "EXCLUSIVE CONTENT" card.
4. **3–5 gallery photos** — thumbnails shown in a scrollable row.
5. **@username** — the handle shown under their name.
6. **Follower count** to display (optional) — e.g. `2.6K`, `18K`.
7. **Their links** — social handles (Instagram, X, TikTok, Reddit, etc.) and paid links (Subscribe, Custom content, Chat).

> **Image tip:** Every image field needs a **URL** (web link to the image), not a file upload. Upload the photo to your image host / CDN first, then paste the link. Use high-quality images — they fill the screen.

---

## Step-by-Step

### 1. Open the creator in the admin
- Go to the **admin → Creators** list.
- Click the creator you're setting up (or create a new one first and fill the basics: name, avatar, theme color).

### 2. Set the theme accent color
- On the **main/profile tab**, set the **Accent color** to the creator's brand color.
- ⚠️ This matters: the Spotlight page automatically pulls its warm background glow and button gradients from this color. Pick a strong, on-brand color.

### 3. Switch the template to Spotlight
- Click the **Spotlight** tab at the top of the editor.
- Under **Page Template**, change the dropdown from **Glass (default)** to **Spotlight (link.me style)**.
- The **Spotlight Settings** section appears below.

### 4. Hero Image
- Leave **Hero enabled** toggled **ON**.
- Paste the hero photo link into **Hero image URL**.

### 5. Name / Username / Followers
- **@Username (shown under name)** — type the handle (no need to add the `@`, it's shown automatically).
- **Show follower count** — toggle **ON** if you want the follower number visible.
- **Follower label** — type what to display, e.g. `2.6K`.

### 6. Featured Card ("EXCLUSIVE CONTENT")
- **Card image URL** — paste the featured photo link.
- **Card label** — the text overlaid on the card. Default is `EXCLUSIVE CONTENT`; you can customize (e.g. `NEW DROP`, `VIP ONLY`).
- **Card link URL** — where tapping the card sends the visitor (usually their paid page).

### 7. Gallery Thumbnails
- Click **Add thumbnail** for each photo (aim for 3–5).
- For each row:
  - **Image URL** — the thumbnail photo link.
  - **Link URL** — where tapping it goes (optional; leave blank if it's just decorative).
- Use the **✕** to remove any thumbnail.

### 8. Add the Links (social + paid)
- Go to the **Links** tab (same editor).
- For each link, fill **Label** (e.g. `Instagram`, `Subscribe — 50% off`), pick an **Icon**, paste the **URL**.
- Mark paid/exclusive links appropriately (badge like `HOT`/`VIP`, sensitive flag if adult).
- Social links become the round pills row; paid links become the big buttons.

### 9. Save
- Scroll down and click **Save**.

### 10. Preview & Verify
- Open the creator's live page on a **phone** (Spotlight is mobile-first).
- Check:
  - [ ] Hero photo loads and looks good (not stretched/pixelated).
  - [ ] Name, @username, follower count show correctly.
  - [ ] Social pills appear and the icons are right.
  - [ ] Featured card shows the image + correct label, and tapping it goes to the right place.
  - [ ] Gallery scrolls sideways and the last thumbnail "peeks" (that's intentional).
  - [ ] Paid buttons (Subscribe/Custom/Chat) work.

---

## Reference / What "good" looks like

Live demo of the layout (mock data):
`/demo-spotlight` on the preview build.

Reference design we cloned: link.me-style — full-bleed hero fading to dark, name + verified badge + @handle, round social pills, follower count, featured "EXCLUSIVE CONTENT" card, scrollable photo gallery, then the link buttons.

---

## Troubleshooting (quick)

| Problem | Fix |
|---|---|
| Hero/featured/gallery image is blank | The URL is wrong or the host isn't allowed. Re-upload to the approved image host and paste a fresh public link. |
| Background glow looks off / wrong color | Fix the **Accent color** on the profile tab — the glow derives from it. |
| Follower count not showing | Toggle **Show follower count** ON and fill the **Follower label**. |
| Page looks like the old style | You're still on **Glass** — switch the **Page Template** dropdown to **Spotlight** and Save. |
| Want to revert to the old look | Switch **Page Template** back to **Glass (default)** and Save. No data is lost. |

---

## Notes
- **Glass vs Spotlight:** Both templates exist side-by-side. Switching between them is non-destructive — your links and content stay; only the layout changes.
- **Everything is per-creator.** No two pages have to look alike — colors, hero, featured card, gallery, and links are all set per creator here.
