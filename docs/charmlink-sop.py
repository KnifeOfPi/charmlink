#!/usr/bin/env python3
"""CharmLink Admin SOP — PDF Generator"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import os

# ── Colors ────────────────────────────────────────────────────────────────────
DARK_BG = HexColor("#0a0a0a")
TEAL = HexColor("#67ECE1")
PINK = HexColor("#EC1CA4")
DARK_CARD = HexColor("#1a1a2e")
WHITE = HexColor("#ffffff")
GRAY = HexColor("#a0a0a0")
LIGHT_GRAY = HexColor("#e0e0e0")
SECTION_BG = HexColor("#f8f9fa")
ACCENT_BG = HexColor("#f0fffe")
WARNING_BG = HexColor("#fff3cd")
DANGER_BG = HexColor("#f8d7da")

# ── Output ────────────────────────────────────────────────────────────────────
OUTPUT = os.path.join(os.path.dirname(__file__), "CharmLink-Admin-SOP.pdf")

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    topMargin=0.75 * inch,
    bottomMargin=0.75 * inch,
    leftMargin=0.75 * inch,
    rightMargin=0.75 * inch,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle(
    "DocTitle", parent=styles["Title"],
    fontSize=28, textColor=HexColor("#1a1a2e"),
    spaceAfter=6, fontName="Helvetica-Bold"
))
styles.add(ParagraphStyle(
    "DocSubtitle", parent=styles["Normal"],
    fontSize=14, textColor=GRAY,
    spaceAfter=20, fontName="Helvetica"
))
styles.add(ParagraphStyle(
    "SectionHead", parent=styles["Heading1"],
    fontSize=18, textColor=HexColor("#1a1a2e"),
    spaceBefore=20, spaceAfter=10,
    fontName="Helvetica-Bold",
    borderWidth=0, borderPadding=0,
))
styles.add(ParagraphStyle(
    "SubHead", parent=styles["Heading2"],
    fontSize=14, textColor=HexColor("#333333"),
    spaceBefore=14, spaceAfter=6,
    fontName="Helvetica-Bold"
))
styles.add(ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontSize=11, textColor=HexColor("#333333"),
    spaceAfter=8, leading=16,
    fontName="Helvetica"
))
styles.add(ParagraphStyle(
    "StepNum", parent=styles["Normal"],
    fontSize=11, textColor=PINK,
    fontName="Helvetica-Bold"
))
styles.add(ParagraphStyle(
    "CodeBlock", parent=styles["Normal"],
    fontSize=10, textColor=HexColor("#d63384"),
    fontName="Courier", backColor=HexColor("#f5f5f5"),
    borderWidth=0.5, borderColor=HexColor("#e0e0e0"),
    borderPadding=4, spaceAfter=8
))
styles.add(ParagraphStyle(
    "Warning", parent=styles["Normal"],
    fontSize=10, textColor=HexColor("#856404"),
    backColor=WARNING_BG, borderPadding=8,
    spaceAfter=10, leading=14, fontName="Helvetica"
))
styles.add(ParagraphStyle(
    "Danger", parent=styles["Normal"],
    fontSize=10, textColor=HexColor("#721c24"),
    backColor=DANGER_BG, borderPadding=8,
    spaceAfter=10, leading=14, fontName="Helvetica-Bold"
))
styles.add(ParagraphStyle(
    "Tip", parent=styles["Normal"],
    fontSize=10, textColor=HexColor("#0c5460"),
    backColor=ACCENT_BG, borderPadding=8,
    spaceAfter=10, leading=14, fontName="Helvetica"
))

story = []

_cell_style = ParagraphStyle(
    "TableCell", parent=styles["Normal"], fontSize=9, leading=11, alignment=TA_LEFT,
)
_cell_style_bold = ParagraphStyle(
    "TableCellBold", parent=_cell_style, fontName="Helvetica-Bold", textColor=WHITE,
)

def cell(text, header=False):
    """Wrap table-cell text in a Paragraph so it actually wraps to the column
    width. Table() silently overflows plain strings that don't fit on one
    line instead of wrapping them — every other table in this doc has
    coincidentally short-enough cell text to never hit that; this one didn't."""
    return Paragraph(text, _cell_style_bold if header else _cell_style)

def title(text):
    story.append(Paragraph(text, styles["DocTitle"]))

def subtitle(text):
    story.append(Paragraph(text, styles["DocSubtitle"]))

def section(text):
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e0e0e0")))
    story.append(Spacer(1, 4))
    story.append(Paragraph(text, styles["SectionHead"]))

def subhead(text):
    story.append(Paragraph(text, styles["SubHead"]))

def body(text):
    story.append(Paragraph(text, styles["Body"]))

def code(text):
    story.append(Paragraph(text, styles["Code"]))

def warning(text):
    story.append(Paragraph(f"⚠️ {text}", styles["Warning"]))

def danger(text):
    story.append(Paragraph(f"🚨 {text}", styles["Danger"]))

def tip(text):
    story.append(Paragraph(f"💡 {text}", styles["Tip"]))

def step(num, text):
    story.append(Paragraph(f'<font color="#EC1CA4"><b>Step {num}.</b></font> {text}', styles["Body"]))

def bullet(text):
    story.append(Paragraph(f"• {text}", styles["Body"]))

def spacer(h=6):
    story.append(Spacer(1, h))

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════

spacer(40)
title("CharmLink Admin SOP")
subtitle("Standard Operating Procedure for Managing Creator Pages")
spacer(10)
body("Version 1.0 — March 2026")
body("Prepared by: Cepheus (AI Assistant)")
body("For: Charm Collective Team")
spacer(20)

# Table of contents
subhead("Contents")
toc_items = [
    "1. Overview — What CharmLink Does",
    "2. Logging Into the Admin Dashboard",
    "3. Adding a New Creator",
    "4. Editing a Creator's Page",
    "4a. Managing a Person's Photos & Shared Look",
    "5. Managing Links (Social + Premium)",
    "6. Visual Customization (Theme, Effects, Fonts)",
    "7. Adding a Custom Domain",
    "8. Monitoring Analytics",
    "9. Security Rules",
    "10. Troubleshooting",
]
for item in toc_items:
    body(item)

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1: OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════

section("1. Overview — What CharmLink Does")

body("CharmLink is a link-in-bio platform built specifically for OnlyFans and Fanvue creators. "
     "It solves the #1 problem creators face: <b>Instagram banning accounts that link to adult content.</b>")

spacer()
body("<b>How it works:</b>")
bullet("Each creator gets a landing page (e.g., <font color='#EC1CA4'>hollybae.me</font>) that shows their social links and premium links")
bullet("When Instagram's bot crawls the page, it only sees clean social links (Twitter, TikTok, etc.) — premium links are never in the page source at all")
bullet("When a real human's browser loads the page, premium links load automatically a moment later, gated by a signed token and bot checks — not by waiting for the visitor to click or scroll")
bullet("The bot never sees the adult content links → Instagram doesn't ban the account")

spacer()
body("<b>Key URLs:</b>")
bullet("Admin Dashboard: <font color='#d63384'>https://charmlink.vercel.app/admin</font>")
bullet("Creator pages: <font color='#d63384'>https://charmlink.vercel.app/[creator-slug]</font>")
bullet("Or via custom domain: <font color='#d63384'>https://hollybae.me</font>")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2: LOGGING IN
# ══════════════════════════════════════════════════════════════════════════════

section("2. Logging Into the Admin Dashboard")

step(1, "Go to <font color='#d63384'>https://charmlink.vercel.app/admin</font>")
step(2, "Enter the admin key when prompted")
step(3, "Click <b>Login</b>")

spacer()
warning("The admin key is stored in your browser's local storage. If you clear your browser data, you'll need to re-enter it.")
danger("NEVER share the admin key via email, Slack, or text. If you need to share access, ask Nate for a separate key.")

tip("The admin key stays active until you clear your browser. You don't need to log in every time.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3: ADDING A NEW CREATOR
# ══════════════════════════════════════════════════════════════════════════════

section("3. Adding a New Creator")

step(1, "Go to <b>Creators</b> in the left sidebar")
step(2, 'Click <b>"Add Creator"</b> at the top')
step(3, "Fill in the required fields:")

spacer(4)

# Fields table
fields_data = [
    ["Field", "What to Enter", "Example"],
    ["Name", "Creator's display name", "Holly Bae"],
    ["Slug", "URL-safe identifier (lowercase, no spaces)", "holly"],
    ["Tagline", "Short bio (1 line)", "Your favorite girl next door 💕"],
    ["Avatar URL", "Direct link to profile photo", "https://i.imgur.com/abc.jpg"],
    ["Custom Domain", "Their personal domain (if they have one)", "hollybae.me"],
]
fields_table = Table(fields_data, colWidths=[1.2*inch, 2.5*inch, 2.5*inch])
fields_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(fields_table)
spacer()

step(4, 'Click <b>"Save"</b>')

spacer()
tip("The slug is what appears in the URL. For example, slug <b>holly</b> → charmlink.vercel.app/<b>holly</b>. "
    "Keep it short and simple. Use the creator's first name or their known handle.")

warning("Slugs must be unique. You can't have two creators with the same slug.")

spacer()
subhead("Adding Another Domain for an Existing Creator")
body("Many creators run several domains for the same page (e.g., if Instagram flags one, they switch to another). "
     "The Creators list groups all of a person's domains under one row so her photos and shared look only need "
     "setting up once — see Section 4a.")
warning("A brand-new domain does NOT automatically join an existing person's group — it starts as its own "
        "row until it's linked. Ask your engineer to link a new domain to the right person after adding it; "
        "there is no self-serve button for this yet.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4: EDITING A CREATOR
# ══════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
section("4. Editing a Creator's Page")

body("The Creators list shows one row per <b>person</b>, expandable to each of her domains. Two different "
     "pages edit two different things:")

spacer()

split_data = [
    [cell("Click...", header=True), cell("Opens...", header=True), cell("Edits...", header=True)],
    [cell("\u201cManage\u201d on her row"), cell("Model page (Section 4a)"),
     cell("Photos + everything shared across ALL her domains")],
    [cell("\u201cLinks\u201d on one domain"), cell("This section (per-domain editor)"),
     cell("That ONE domain's own social/premium links + a few per-domain settings")],
]
split_table = Table(split_data, colWidths=[1.7*inch, 2.1*inch, 2.4*inch])
split_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(split_table)
spacer()

body("The per-domain editor has <b>5 tabs</b>:")

spacer()

tabs_data = [
    ["Tab", "What It Controls"],
    ["Profile", "This domain's own slug + custom domain, active/sensitive toggles"],
    ["Theme", "Background colors, gradient type & direction, accent & text colors \u2014 overridden by her shared theme if this domain belongs to a person with one set"],
    ["Effects", "Floating emoji, star particles, animation speed"],
    ["Avatar", "Just a button linking to the model page \u2014 photos and frame/border are set there now, not per-domain (Section 4a)"],
    ["Misc", "Font family, location display, location pill color"],
]
tabs_table = Table(tabs_data, colWidths=[1.2*inch, 5*inch])
tabs_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(tabs_table)
spacer()

warning("Always click <b>Save</b> after making changes on any tab. Changes are NOT auto-saved.")
tip("Changes go live immediately after saving — no deploy or restart needed.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4a: MANAGING A PERSON (MODEL PAGE)
# ══════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
section("4a. Managing a Person's Photos & Shared Look")

body("Click <b>\u201cManage\u201d</b> on a person's row in the Creators list to open her model page. "
     "Everything here applies to <b>every one of her domains at once</b> \u2014 set it up once instead of "
     "repeating it per site.")

spacer()
subhead("Photo Carousel (A/B testing)")
body("Upload up to <b>10 candidate photos</b>. The site automatically rotates them across her visitors and "
     "tracks which photo leads to more premium subscriptions \u2014 better performers earn more traffic over "
     "time, automatically, with no manual tuning.")
bullet("Each photo shows its live <b>conversion rate</b> (subscriptions \u00f7 views) once it has enough traffic to trust")
bullet("A photo needs about <b>200 views</b> before its number means anything \u2014 the app tells you how many more it needs")
bullet('<b>📌 Pin</b> a photo (up to 3) to lock the rotation to your proven winners and stop testing new ones')
bullet("<b>⏸ Pause</b> a photo to remove it from rotation without deleting its history")
bullet("<b>Click the photo thumbnail</b> to re-center the crop \u2014 useful if a face gets cut off (see Frame Shape below)")

spacer()
subhead("Shared Identity")
body("Name, tagline, background/accent/text colors, avatar frame shape, border style, and the verified badge "
     "\u2014 set once, applied to every domain.")
bullet("<b>Frame Shape:</b> Circle (classic), Portrait (rectangle matching a phone photo\u2019s natural shape "
       "\u2014 crops almost nothing, best for full-body or half-body shots), or Rounded Square")
bullet("<b>Border Style:</b> Solid, animated Gradient, or None")

spacer()
subhead("Sites")
body("Lists every domain that belongs to this person, with a <b>Links</b> button to jump to that domain's own link editor.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5: MANAGING LINKS
# ══════════════════════════════════════════════════════════════════════════════

section("5. Managing Links (Social + Premium)")

body("Each creator has two types of links:")

spacer()

link_types = [
    ["Type", "Visible To", "Examples"],
    ["Social", "Everyone (bots + humans)", "Twitter, TikTok, Instagram, YouTube"],
    ["Premium", "Humans only (hidden from bots)", "OnlyFans, Fanvue, Fansly"],
]
link_table = Table(link_types, colWidths=[1.2*inch, 2.2*inch, 2.8*inch])
link_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
]))
story.append(link_table)
spacer()

subhead("Adding a Link")
step(1, "Open the creator's edit page")
step(2, "Scroll down to the Links section")
step(3, 'Click <b>"Add Link"</b>')
step(4, "Fill in: <b>Label</b> (display text), <b>URL</b> (destination), <b>Icon</b>, and <b>Type</b> (social or premium)")
step(5, 'Optionally expand <b>"✨ Visual options"</b> for badges, subtitles, image backgrounds, glow effects, and animations')
step(6, 'Click <b>"Save"</b>')

spacer()
danger("CRITICAL: OnlyFans, Fanvue, and Fansly links MUST be set as type 'premium'. "
       "If you accidentally set them as 'social', Instagram bots WILL see them and the creator's account could get banned.")

subhead("Link Visual Options")

visual_data = [
    ["Option", "What It Does"],
    ["Subtitle", "Small text below the link label"],
    ["Badge", "Colored pill: New (green), Popular (orange), Exclusive (purple)"],
    ["Image URL", "Turns the link into a wide card with a background image"],
    ["Sensitive", "Blurs the link until the user clicks 'reveal'"],
    ["Deeplink", "Opens the destination in the native app (OnlyFans, Instagram, etc.)"],
    ["Text Glow", "Adds a glowing effect to the link text"],
    ["Hover Animation", "Pulse, bounce, shake, or glow effect on hover"],
]
visual_table = Table(visual_data, colWidths=[1.5*inch, 4.7*inch])
visual_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(visual_table)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6: VISUAL CUSTOMIZATION
# ══════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
section("6. Visual Customization")

body("Each creator's page can be fully customized with colors, effects, and fonts.")

subhead("Background")
bullet("<b>Solid</b> — Single background color")
bullet("<b>Linear Gradient</b> — Two or three colors blending in a direction (e.g., top to bottom)")
bullet("<b>Radial Gradient</b> — Colors blending from center outward")
spacer(4)
body("Set via the <b>Theme</b> tab. Choose background type, then set Color 1 (primary), Color 2, "
     "and optionally Color 3. For gradients, also pick the direction.")

subhead("Effects")
bullet("<b>Floating Icons</b> — Animated emoji floating up the page (e.g., 💫, ❤️, ✨). "
       "Set the emoji, count (how many), and speed.")
bullet("<b>Star Particles</b> — Twinkling dots in the background. Set count and color.")
spacer(4)
body("Set via the <b>Effects</b> tab.")

subhead("Avatar")
body("Photos, frame shape, and border are now set on the <b>person's model page</b> (Section 4a), not here \u2014 "
     "since one person's avatar applies to all her domains. Click \u201cOpen model settings\u201d on this "
     "creator's Avatar tab to jump there.")

subhead("Fonts")
body("Choose from 6 Google Fonts in the <b>Misc</b> tab:")
bullet("Inter (clean, modern — default)")
bullet("Poppins (friendly, rounded)")
bullet("Playfair Display (elegant, serif)")
bullet("Roboto (neutral, professional)")
bullet("Montserrat (bold, geometric)")
bullet("Dancing Script (handwritten, playful)")

tip("Preview the page after changing fonts to make sure it looks good with the creator's content. "
    "Dancing Script is great for personal brands but hard to read in small sizes.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7: CUSTOM DOMAINS
# ══════════════════════════════════════════════════════════════════════════════

section("7. Adding a Custom Domain")

body("Each creator can have their own domain (e.g., <b>hollybae.me</b>) that points to their CharmLink page.")

subhead("Automated Setup (Recommended)")
body("If the domain is already on Cloudflare (most of ours are), the process is fully automated:")

spacer(4)
step(1, "Open the creator's edit page → <b>Profile</b> tab")
step(2, 'Enter the domain in the <b>"Custom Domain"</b> field (e.g., <font color="#d63384">hollybae.me</font>)')
step(3, 'Click <b>"Add to Vercel"</b>')
step(4, "The system automatically:")
bullet("    → Adds the domain to the Vercel project")
bullet("    → Finds the domain's zone on Cloudflare")
bullet("    → Deletes any conflicting DNS records")
bullet("    → Creates an A record pointing to <font color='#d63384'>76.76.21.21</font> (Vercel)")
bullet("    → Vercel auto-provisions an SSL certificate")
step(5, "Wait 2–5 minutes for DNS propagation and SSL")
step(6, "Test by visiting the domain in a browser")

spacer()
warning("Make sure the domain is already purchased and on Cloudflare before adding it here. "
        "If the domain isn't on our Cloudflare account, the DNS automation won't work.")

subhead("Manual Setup (Non-Cloudflare Domains)")
body("If the domain is NOT on Cloudflare:")
step(1, 'Add the domain in CharmLink admin (same as above) — it\'ll add to Vercel but skip DNS')
step(2, "Go to the domain's DNS provider and add this record:")

dns_data = [
    ["Type", "Name", "Value", "Proxy"],
    ["A", "@", "76.76.21.21", "OFF"],
]
dns_table = Table(dns_data, colWidths=[1*inch, 1.5*inch, 2*inch, 1.5*inch])
dns_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
]))
story.append(dns_table)
spacer()

danger("Cloudflare Proxy MUST be OFF (gray cloud, not orange) for Vercel domains. "
       "If proxy is on, Vercel can't provision the SSL certificate.")

subhead("Removing a Domain")
step(1, "Go to <b>Domains</b> in the left sidebar")
step(2, "Find the domain and click <b>Remove</b>")
step(3, "This removes it from Vercel only — you'll need to clean up DNS records manually")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8: ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
section("8. Monitoring Analytics")

body("The Analytics page shows traffic and engagement data, one card per <b>person</b> (her domains combined "
     "into one set of numbers). Use the search box on the left to find someone in a long roster instead of "
     "scrolling; click her name to view her card. A \u201cN domains\u201d link on her card expands to show "
     "each individual domain's own numbers side by side.")

subhead("Key Metrics")

metrics_data = [
    ["Metric", "What It Means"],
    ["Human Views", "Real people who visited the page (bots excluded)"],
    ["Bot Views", "Crawlers/bots that visited (Instagram, Google, etc.)"],
    ["Unique Visitors", "Distinct browser sessions"],
    ["Premium Clicks", "Clicks on OnlyFans/Fanvue links"],
    ["Social Clicks", "Clicks on Twitter/TikTok/IG links"],
    ["CTR", "Premium clicks ÷ human views (conversion rate)"],
    ["Instagram Traffic", "Visitors from Instagram's in-app browser"],
]
metrics_table = Table(metrics_data, colWidths=[1.5*inch, 4.7*inch])
metrics_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (-1, -1), HexColor("#f8f9fa")),
    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
    ("PADDING", (0, 0), (-1, -1), 6),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(metrics_table)
spacer()

body("Use the time period selector (Today, 7 Days, 30 Days, All Time) to filter data.")
spacer()
tip("The most important metric is <b>CTR (Click-Through Rate)</b>. If a creator has high views but low CTR, "
    "their premium links might need better labels, badges, or positioning.")

tip("Some nonzero <b>Bot Views</b> alongside Human Views is normal — it means the bot protection is working and "
    "Instagram/Google crawl activity is being correctly separated out, not counted as real traffic.")

spacer()
body("If she has an active photo carousel (Section 4a), her card also shows a <b>Photo Performance</b> row \u2014 "
     "conversion rate per photo, with the best-performing one marked.")

spacer()
subhead("Blocked Visitors (Dashboard)")
body("The main Dashboard page has a <b>Blocked Visitors</b> card showing how many visitors are currently blocked "
     "by the bot trap, with a <b>Clear all bans</b> button. A block normally clears itself after 24 hours, but if "
     "a creator reports someone genuinely real can't see their premium links, check this card first and clear it "
     "if the count looks high — it's a one-click, safe action.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9: SECURITY RULES
# ══════════════════════════════════════════════════════════════════════════════

section("9. Security Rules")

danger("These rules are non-negotiable. Breaking them can get creator accounts banned or expose the platform.")

spacer()
body("<b>1. NEVER set OnlyFans/Fanvue/Fansly links as 'social' type.</b> They must ALWAYS be 'premium'. "
     "Social links are visible to Instagram's bot.")

body("<b>2. NEVER share the admin key</b> in email, Slack messages, texts, or any unencrypted channel.")

body("<b>3. NEVER put NSFW keywords</b> in creator taglines, link labels, or page text. "
     "These appear in the HTML source that bots can read. Keep it clean.")

body("<b>4. NEVER turn off a creator's page</b> (set inactive) without asking Nate first. "
     "It will break their bio link immediately.")

body("<b>5. When adding image URLs</b> for links or avatars, make sure the images themselves don't contain "
     "NSFW content that could be detected by IG's image scanner via OG tags. Use suggestive but safe images.")

body("<b>6. Custom domains</b> — always test after adding. Visit the domain in a private/incognito window "
     "to make sure SSL works and the page loads correctly.")

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10: TROUBLESHOOTING
# ══════════════════════════════════════════════════════════════════════════════

section("10. Troubleshooting")

subhead("Page shows 404 or blank")
bullet("Check that the creator is set to <b>Active</b> in the admin")
bullet("Verify the slug matches the URL exactly")
bullet("If using a custom domain, check that DNS has propagated (try <font color='#d63384'>dnschecker.org</font>)")

subhead("Custom domain shows SSL error")
bullet("Make sure Cloudflare proxy is <b>OFF</b> (gray cloud)")
bullet("Wait 5–10 minutes — Vercel needs time to provision the cert")
bullet("Check the domain status in the Domains admin page")

subhead("Premium links not showing")
bullet("Check the <b>Blocked Visitors</b> card on the Dashboard — if that visitor's IP was flagged by the bot trap, "
       "they'll see a blank/generic page instead of premium links until the block clears. You can clear it yourself "
       "with the button there; it's safe to click anytime.")
bullet("Make sure you're testing on a real device, not a bot/crawler")
bullet("Check that the links are set to type <b>'premium'</b> and are <b>active</b>")
bullet("Premium links load automatically a moment after the page opens — if they never appear at all (not just "
       "delayed), it's not a waiting problem; escalate to Nate")

subhead("Analytics showing zero")
bullet("Analytics require real traffic — check that someone has actually visited the page")
bullet("Bot visits are tracked separately; look at 'Bot Views' vs 'Human Views'")
bullet("Data appears in real-time — no delay")
bullet("If EVERY number on the page is zero at once (not just one quiet creator), that's a different problem — "
       "a backend issue, not missing traffic. Refresh the page once; if it's still all zeros, the underlying "
       "data is still safe and this needs an engineer, not a re-check of who visited")

spacer()
subhead("A domain isn't showing up under the right person")
bullet("A newly added domain starts as its own separate row until an engineer links it to the right person "
       "— see the warning in Section 3. This isn't something you can fix from the admin yet.")

subhead("Admin login not working")
bullet("Clear your browser's local storage and try again")
bullet("Make sure you're using the correct admin key")
bullet("If the key was rotated, ask Nate for the new one")

spacer(20)

# Footer
story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e0e0e0")))
spacer(6)
story.append(Paragraph(
    "CONFIDENTIAL — Charm Collective Internal Use Only",
    ParagraphStyle("Footer", parent=styles["Normal"],
                   fontSize=9, textColor=GRAY, alignment=TA_CENTER)
))
story.append(Paragraph(
    "Questions? Contact Nate or ask Cepheus.",
    ParagraphStyle("Footer2", parent=styles["Normal"],
                   fontSize=9, textColor=GRAY, alignment=TA_CENTER)
))

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"MEDIA:{OUTPUT}")
