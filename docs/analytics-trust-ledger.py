#!/usr/bin/env python3
"""CharmLink Analytics Trust Ledger — PDF Generator

Manager-facing companion to charmlink-sop.py and charmlink-autoredirect-sop.py;
deliberately reuses their palette, styles and helper vocabulary so the three
documents read as one set. Regenerate with:

    python3 docs/analytics-trust-ledger.py

NOTE ON GLYPHS: the built-in Helvetica used here is WinAnsi-encoded, so arrows,
check marks, emoji and the typographic minus (U+2212) render as solid black
boxes. Status is therefore carried by words ("TRUST" / "IGNORE") and negatives
use a plain hyphen. The sibling generators hold to the same rule.

The one apparent exception is safe: ReportLab encodes the bullet in bullet() to
byte 0x7f rather than the canonical 0x95. PDF 32000-1 Annex D.2 maps every
unused WinAnsi code above 40 to the bullet glyph, so this is spec-legal, and
CharmLink-Admin-SOP.pdf has shipped 43 of them without a complaint. Leave it be.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
import os

# ── Colors (matched to charmlink-sop.py) ──────────────────────────────────────
TEAL = HexColor("#67ECE1")
PINK = HexColor("#EC1CA4")
GRAY = HexColor("#a0a0a0")
SECTION_BG = HexColor("#f8f9fa")
ACCENT_BG = HexColor("#f0fffe")
WARNING_BG = HexColor("#fff3cd")
DANGER_BG = HexColor("#f8d7da")

# Status colors for the ledger. Kept distinct from the brand palette above so a
# reader is never asked to tell "brand pink" from "this number is wrong".
GOOD_TX = HexColor("#1d6b48")
WARN_TX = HexColor("#8a5b10")
BAD_TX = HexColor("#9c302a")

OUTPUT = os.path.join(os.path.dirname(__file__), "CharmLink-Analytics-Trust-Ledger.pdf")

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    topMargin=0.75 * inch,
    bottomMargin=0.75 * inch,
    leftMargin=0.75 * inch,
    rightMargin=0.75 * inch,
    title="CharmLink Analytics Trust Ledger",
    author="Charm Collective",
)

styles = getSampleStyleSheet()

styles.add(ParagraphStyle("DocTitle", parent=styles["Title"], fontSize=28,
                          textColor=HexColor("#1a1a2e"), spaceAfter=6,
                          fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("DocSubtitle", parent=styles["Normal"], fontSize=14,
                          textColor=GRAY, spaceAfter=20, fontName="Helvetica"))
# keepWithNext: a section heading alone at the foot of a page reads as the end
# of the document to someone skimming. Same reason blocks use KeepTogether.
styles.add(ParagraphStyle("SectionHead", parent=styles["Heading1"], fontSize=18,
                          textColor=HexColor("#1a1a2e"), spaceBefore=20,
                          spaceAfter=10, fontName="Helvetica-Bold",
                          keepWithNext=1))
styles.add(ParagraphStyle("SubHead", parent=styles["Heading2"], fontSize=13,
                          textColor=HexColor("#333333"), spaceBefore=14,
                          spaceAfter=6, fontName="Helvetica-Bold",
                          keepWithNext=1))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10.5,
                          textColor=HexColor("#333333"), spaceAfter=8,
                          leading=15.5, fontName="Helvetica"))
styles.add(ParagraphStyle("Warning", parent=styles["Normal"], fontSize=10,
                          textColor=HexColor("#856404"), backColor=WARNING_BG,
                          borderPadding=8, spaceAfter=10, leading=14,
                          fontName="Helvetica"))
styles.add(ParagraphStyle("Danger", parent=styles["Normal"], fontSize=10,
                          textColor=HexColor("#721c24"), backColor=DANGER_BG,
                          borderPadding=8, spaceAfter=10, leading=14,
                          fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("Tip", parent=styles["Normal"], fontSize=10,
                          textColor=HexColor("#0c5460"), backColor=ACCENT_BG,
                          borderPadding=8, spaceAfter=10, leading=14,
                          fontName="Helvetica"))
styles.add(ParagraphStyle("Cell", parent=styles["Normal"], fontSize=9,
                          textColor=HexColor("#333333"), leading=12.5,
                          fontName="Helvetica"))
styles.add(ParagraphStyle("CellBold", parent=styles["Cell"],
                          fontName="Helvetica-Bold"))

story = []

def title(t): story.append(Paragraph(t, styles["DocTitle"]))
def subtitle(t): story.append(Paragraph(t, styles["DocSubtitle"]))
def subhead(t): story.append(Paragraph(t, styles["SubHead"]))
def body(t): story.append(Paragraph(t, styles["Body"]))
def warning(t): story.append(Paragraph(f"WARNING — {t}", styles["Warning"]))
def danger(t): story.append(Paragraph(f"STOP — {t}", styles["Danger"]))
def tip(t): story.append(Paragraph(f"NOTE — {t}", styles["Tip"]))
def bullet(t): story.append(Paragraph(f"• {t}", styles["Body"]))
def spacer(h=6): story.append(Spacer(1, h))

def section(t):
    # Appended flat, NOT wrapped in KeepTogether: a KeepTogether becomes its own
    # unit and severs the heading's keepWithNext link to the content after it,
    # which is what actually prevents a heading stranding at a page foot.
    spacer(10)
    story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e0e0e0")))
    spacer(4)
    story.append(Paragraph(t, styles["SectionHead"]))

def dated(date, heading, paras):
    """A date boundary. KeepTogether because a date separated from the change it
       explains is worse than useless — it reads as applying to the next one."""
    flow = [Paragraph(
        f'<font color="#EC1CA4"><b>{date}</b></font> &nbsp; <b>{heading}</b>',
        styles["Body"])]
    for p in paras:
        flow.append(Paragraph(p, styles["Body"]))
    story.append(KeepTogether(flow))

def grid(rows, widths):
    """Table whose cells wrap — plain strings do not wrap in ReportLab and
       silently overflow the page (a bug already hit in charmlink-sop.py)."""
    data = [[Paragraph(c, styles["CellBold"] if i == 0 else styles["Cell"])
             for c in row] for i, row in enumerate(rows)]
    # repeatRows: a table that splits across a page otherwise leaves its header
    # behind, so the continuation is unlabelled columns.
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), SECTION_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dddddd")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    t.setStyle(TableStyle(style))
    story.append(t)
    spacer(10)

def status(word):
    """Status as a coloured word rather than an icon — see the glyph note up top."""
    color = {"TRUST": GOOD_TX, "TRUST AFTER": WARN_TX, "IGNORE": BAD_TX}[word]
    return f'<font color="#{color.hexval()[2:]}"><b>{word}</b></font>'

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════

spacer(30)
title("Analytics Trust Ledger")
subtitle("CharmLink Reporting Note")
body("Version 1.0 — 4 September 2026")
body("Applies to: CharmLink admin dashboard and OnlyFans tracking links")
spacer(16)

body(
    "Three separate faults in our analytics were found and fixed this week. Each "
    "one changes how the dashboard reads, and two of them produced numbers that "
    "were confidently wrong rather than obviously broken."
)
body(
    "This note records which figures can be trusted, which should be ignored, and "
    "the three dates that account for every apparent jump in the graphs. It is "
    "written to be read before the next weekly review."
)
spacer(10)

subhead("Contents")
for item in [
    "1. If you read nothing else",
    "2. The trust ledger",
    "3. Three dates that explain the graphs",
    "4. The one real decline",
    "5. Traps worth knowing about",
    "6. Standing rules",
]:
    body(item)

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
section("1. If you read nothing else")
# ══════════════════════════════════════════════════════════════════════════════

bullet(
    "<b>Big swings in the dashboard this week are mostly the meter being fixed, "
    "not the business changing.</b> Reported views fell and CTR roughly tripled "
    "on the same day, because we stopped counting some visitors twice."
)
bullet(
    "<b>The three auto-redirect domains were never broken. The counter was.</b> "
    "They reported zero for their entire life while OnlyFans recorded 152 clicks "
    "against those same links in a single week."
)
bullet(
    "<b>One decline is real: fav-site.com is down about a third,</b> confirmed "
    "independently by OnlyFans' own figures. That one is not a tracking artifact."
)
bullet(
    "<b>For anything about revenue, OnlyFans is the source of truth.</b> Our "
    "numbers count arrivals at our page; theirs count landings on the offer. The "
    "two will not match, and that is correct."
)

tip(
    "The single habit that would have caught this week's largest error: before "
    "calling a domain dead, check OnlyFans for the same tracking link. Our "
    "dashboard said zero; OnlyFans said 152 clicks."
)

# ══════════════════════════════════════════════════════════════════════════════
section("2. The trust ledger")
# ══════════════════════════════════════════════════════════════════════════════

body(
    "What each dashboard figure is worth, and from when. Anything marked "
    "<b>TRUST AFTER</b> is sound going forward but must not be compared against "
    "dates before the one shown."
)

grid([
    ["Metric", "Status", "Reliable from", "Why"],
    ["OnlyFans clicks and subs", status("TRUST"), "Always",
     "Recorded by OnlyFans, independent of our code. The reference for anything revenue-related."],
    ["Premium clicks", status("TRUST"), "Always",
     "Never affected by the double-count. Safe to compare across any period."],
    ["Instagram traffic", status("TRUST"), "Always",
     "Counted once per visit throughout."],
    ["Page views", status("TRUST AFTER"), "30 Aug 2026",
     "Earlier figures are inflated on Instagram-heavy domains: one visitor was counted as two."],
    ["CTR", status("TRUST AFTER"), "30 Aug 2026",
     "Built on page views, so it read artificially low before the fix."],
    ["Photo performance", status("TRUST AFTER"), "30 Aug 2026",
     "Earlier results credited the wrong photo and cannot be recovered."],
    ["Auto-redirect arrivals", status("TRUST AFTER"), "4 Sep 2026",
     "Nothing at all was recorded before 3 Sep. There is no history to compare against."],
    ["Escape failures", status("IGNORE"), "n/a",
     "Measures how long someone took to tap a dialog, not whether they got stuck. Half of the "
     "sessions it flagged as failures went on to convert."],
    ["Top referrers", status("IGNORE"), "n/a",
     "Known fault: the panel reports each domain against itself. It is not telling you where "
     "traffic came from."],
], [1.45 * inch, 1.05 * inch, 1.0 * inch, 3.5 * inch])

# ══════════════════════════════════════════════════════════════════════════════
section("3. Three dates that explain the graphs")
# ══════════════════════════════════════════════════════════════════════════════

body("Any sharp step in this week's charts traces back to one of these three dates.")

dated("30 Aug", "Views fell, CTR tripled, nothing actually changed", [
    "When an Instagram visitor was bounced out to Safari, the second page load was "
    "counted as a second person. Removing that double-count cut reported views "
    "roughly in half on Instagram-heavy domains, and moved CTR from about 23 per "
    "cent to about 72 per cent overnight.",
    "<b>Read it as:</b> the denominator became honest. Traffic did not collapse and "
    "conversion did not triple. Do not compare views or CTR across this date.",
])

dated("3 Sep", "Auto-redirect domains start existing in the data", [
    "Every visit to message-hanna.com, tap-dat.com and c-lickit.com was being "
    "rejected by the database and silently discarded. The dashboard showed zero, "
    "which read as three dead domains, while OnlyFans recorded 152 clicks and 2 "
    "subscribers against those same links over seven days.",
    "<b>Read it as:</b> a counter switching on. Growth on these domains in early "
    "September is not new traffic. Everything before 3 September is unrecoverable.",
])

dated("4 Sep", "Redirect arrivals become near-complete", [
    "Redirect pages hand the visitor to another app almost immediately, which could "
    "kill the tracking signal before it was sent. A signal that never arrives looks "
    "exactly like a visitor who never came. The server now records the arrival "
    "itself, so it no longer depends on the visitor's phone cooperating.",
    "<b>Read it as:</b> a modest step up in reported arrivals on those three domains "
    "around 4 September, reflecting better capture rather than more people.",
])

# ══════════════════════════════════════════════════════════════════════════════
section("4. The one real decline")
# ══════════════════════════════════════════════════════════════════════════════

body(
    "Comparing the seven days to 2 September against the seven before it, measured "
    "in OnlyFans' own figures rather than ours:"
)

grid([
    ["", "fav-site.com", "Whole account"],
    ["Clicks", "-33%", "-7%"],
    ["Subscribers", "-38%", "-2%"],
], [1.6 * inch, 1.6 * inch, 1.6 * inch])

body(
    "Our own tracking shows the same magnitude independently, which is what rules "
    "out a measurement fault. The page itself is healthy: it loads correctly, "
    "serves the right links, and no filter is turning away legitimate visitors. "
    "This was verified directly against the live site."
)
body(
    "The account overall is close to flat, so this is one domain losing ground "
    "rather than a business-wide drop. <b>The most likely cause sits upstream on "
    "Instagram</b> — fewer people reaching or tapping that specific link — rather "
    "than anything in our own stack."
)

warning(
    "This is the one figure in this note that warrants a business decision rather "
    "than reassurance. Recommend watching it for another week before acting, since "
    "a single week is short for a domain whose traffic already moves around."
)

# ══════════════════════════════════════════════════════════════════════════════
section("5. Traps worth knowing about")
# ══════════════════════════════════════════════════════════════════════════════

subhead("Never total OnlyFans figures by campaign code")
body(
    "Campaign codes repeat across her two OnlyFans accounts. Code 1079 exists on "
    "both: one carries 62 clicks, the other 315. Adding by code silently merges "
    "two unrelated links into one wrong number. Always match on the full tracking "
    "URL instead."
)

subhead("Our counts will sit below OnlyFans on redirect domains")
body(
    "We count someone arriving at our page. OnlyFans counts them landing on the "
    "offer. Those are different points in the same funnel, so a gap between the two "
    "is expected and healthy. Use ours for traffic direction and theirs for "
    "conversion, and do not treat the difference as lost data."
)

subhead("A zero has meant two different things")
body(
    "Every fault found this week presented as a zero, and a zero produced by a "
    "broken counter is indistinguishable from genuine silence. That ambiguity is "
    "what produced the conclusion that three healthy domains were dead."
)
body(
    "Guardrails now exist for exactly this: failed writes are recorded rather than "
    "discarded, and an automated check fails the build if the system tries to "
    "record something the database would reject. That check would have caught the "
    "auto-redirect fault on the day the feature shipped."
)

# ══════════════════════════════════════════════════════════════════════════════
section("6. Standing rules")
# ══════════════════════════════════════════════════════════════════════════════

body("How to read the dashboard from here.")

grid([
    ["#", "Rule"],
    ["1", "Do not compare views or CTR across 30 August. Clicks are safe to compare across any date."],
    ["2", "Treat the auto-redirect domains as having no history before 4 September."],
    ["3", "For anything about revenue, quote OnlyFans, matched on the full tracking URL."],
    ["4", "Ignore the escape-failure and top-referrer panels entirely until they are rebuilt."],
    ["5", "Before calling a domain dead, check OnlyFans for the same link."],
    ["6", "The escape-versus-stay experiment is switched off. No test is running, and no result should be quoted from it."],
], [0.4 * inch, 6.4 * inch])

spacer(6)
body(
    "<i>Figures verified against production data and OnlyFans tracking on 4 "
    "September 2026. Questions on any single number should go to engineering with "
    "the domain and date range attached.</i>"
)

doc.build(story)
print(f"Wrote {OUTPUT}")
