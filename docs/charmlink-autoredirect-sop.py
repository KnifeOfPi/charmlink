#!/usr/bin/env python3
"""CharmLink Auto-Redirect SOP — PDF Generator

Companion to charmlink-sop.py; deliberately reuses its palette, styles and
helper vocabulary so the two documents read as one set. Regenerate with:

    python3 docs/charmlink-autoredirect-sop.py
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

OUTPUT = os.path.join(os.path.dirname(__file__), "CharmLink-AutoRedirect-SOP.pdf")

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    topMargin=0.75 * inch,
    bottomMargin=0.75 * inch,
    leftMargin=0.75 * inch,
    rightMargin=0.75 * inch,
    title="CharmLink Auto-Redirect SOP",
    author="Charm Collective",
)

styles = getSampleStyleSheet()

styles.add(ParagraphStyle("DocTitle", parent=styles["Title"], fontSize=28,
                          textColor=HexColor("#1a1a2e"), spaceAfter=6,
                          fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("DocSubtitle", parent=styles["Normal"], fontSize=14,
                          textColor=GRAY, spaceAfter=20, fontName="Helvetica"))
# keepWithNext: a section heading alone at the foot of a page reads as the end
# of the document to someone skimming. Same reason steps use KeepTogether below.
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
styles.add(ParagraphStyle("Cell", parent=styles["Normal"], fontSize=9.5,
                          textColor=HexColor("#333333"), leading=13,
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

def step(num, heading, text):
    # KeepTogether: without it ReportLab happily leaves "Step 1." alone at the
    # foot of a page with its instruction overleaf, which is exactly the kind of
    # thing someone following the SOP on a phone will misread as the whole step.
    story.append(KeepTogether([
        Paragraph(
            f'<font color="#EC1CA4"><b>Step {num}.</b></font> <b>{heading}</b>',
            styles["Body"]),
        Paragraph(text, styles["Body"]),
    ]))

def grid(rows, widths):
    """Table whose cells wrap — plain strings do not wrap in ReportLab and
       silently overflow the page (a bug already hit in charmlink-sop.py)."""
    data = [[Paragraph(c, styles["CellBold"] if i == 0 else styles["Cell"])
             for c in row] for i, row in enumerate(rows)]
    # repeatRows: a table that splits across a page otherwise leaves its header
    # behind, so the continuation is unlabelled columns. Repeating it also means
    # a header stranded at a page foot is harmless rather than misleading.
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SECTION_BG),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dddddd")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    spacer(10)

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════

spacer(30)
title("Auto-Redirect Links")
subtitle("CharmLink Standard Operating Procedure")
body("Version 1.0 — 1 September 2026")
body("Applies to: CharmLink admin at <b>/admin</b>")
spacer(16)

body(
    "An <b>auto-redirect</b> site has no landing page. A visitor who opens the "
    "domain is sent straight to one OnlyFans link, escaping the Instagram in-app "
    "browser on the way. There is nothing to read and nothing to tap."
)
body(
    "This is a different product from a normal CharmLink page, and it carries a "
    "different risk. Read Section 1 before creating one."
)
spacer(10)

subhead("Contents")
for item in [
    "1. Before you start — the one rule that matters",
    "2. What you need in hand",
    "3. Step-by-step: creating an auto-redirect link",
    "4. Verifying it works",
    "5. Turning it off",
    "6. Troubleshooting",
    "7. Glossary",
]:
    body(item)

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
section("1. Before you start — the one rule that matters")
# ══════════════════════════════════════════════════════════════════════════════

danger(
    "Only ever put an auto-redirect on a throwaway domain. Never on a domain "
    "that is already earning."
)

body(
    "A normal CharmLink page looks like a link-in-bio page. A page that instantly "
    "forwards to OnlyFans is far easier for Instagram to detect and ban, because "
    "there is nothing else on it."
)
body(
    "CharmLink does protect these domains: crawlers are served a decoy blog "
    "instead of the real page, so an automated check sees an article about hiking "
    "rather than a redirect. That protection is real and switched on by default. "
    "It is not a guarantee."
)
body(
    "So assume any auto-redirect domain <b>may eventually be burned</b>, and make "
    "sure that when it is, nothing valuable burns with it. Because one domain is "
    "one site in CharmLink, a banned auto-redirect domain takes down only itself "
    "— provided you did not put it on a domain that was already working."
)

tip(
    "Rule of thumb: if losing this domain tomorrow would cost you money, it is "
    "the wrong domain for an auto-redirect."
)

# ══════════════════════════════════════════════════════════════════════════════
section("2. What you need in hand")
# ══════════════════════════════════════════════════════════════════════════════

grid([
    ["What", "Why", "Where it comes from"],
    ["A spare domain",
     "The one that may get burned. Must not be an earning domain.",
     "Registrar, then add to Cloudflare"],
    ["The domain on Cloudflare",
     "Its nameservers must already point at Cloudflare before CharmLink can "
     "provision it.",
     "Cloudflare dashboard"],
    ["A fresh OnlyFans tracking link",
     "So this domain's clicks and subscribers are counted separately from "
     "everything else.",
     "OnlyFans / Infloww"],
    ["The creator's name in CharmLink",
     "The new domain is attached to an existing person, not created as a new one.",
     "Admin &rarr; Creators"],
], [1.5 * inch, 3.0 * inch, 2.0 * inch])

warning(
    "Use a tracking code that is not used anywhere else. If you reuse an existing "
    "code, its numbers mix with the other pages and you will not be able to tell "
    "whether the auto-redirect actually performed better."
)

# The procedure starts on a fresh page. Deterministic, and it is the page
# someone actually follows while clicking — worth not splitting across a fold.
# (keepWithNext alone does not hold here: the following flowable is a large
# KeepTogether block, and ReportLab drops the link rather than moving both.)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
section("3. Step-by-step: creating an auto-redirect link")
# ══════════════════════════════════════════════════════════════════════════════

step(1, "Register the domain with CharmLink",
     "Go to <b>Admin &rarr; Domains</b>. Under <b>Add Custom Domain</b>, enter the "
     "domain and submit. This registers it with the hosting and sets up "
     "Cloudflare automatically. If the row shows <b>SSL broken</b>, press the "
     "<b>Heal</b> button on that row and wait — this is normal for a brand new "
     "domain and usually clears within a few minutes.")

step(2, "Add the domain to the right person",
     "Go to <b>Admin &rarr; Creators</b> and open the creator, then open her "
     "<b>Person</b> settings. In the <b>Sites</b> card at the bottom, use "
     "<b>Add another domain</b>: enter a <b>slug</b> (a short internal name, "
     "lowercase, no spaces — e.g. <font face='Courier'>reynaxo</font>) and the "
     "<b>domain</b> you just registered. Press <b>Add domain</b>.")

warning(
    "Add the domain from the <b>person's</b> page, not with the "
    "<b>Add Creator</b> button on the Creators page. Add Creator makes a site "
    "that belongs to nobody, and a site belonging to nobody does not appear in "
    "the Creators list at all — it goes live and becomes invisible."
)

step(3, "Add the OnlyFans link",
     "You are now on the new site's page. In the right-hand column find "
     "<b>Add Link</b>. Set <b>Label</b> to something meaningful for you (it is "
     "never shown to visitors on an auto-redirect site), paste the fresh "
     "OnlyFans tracking URL, and set <b>Type</b> to <b>Premium</b>. Save the link.")

step(4, "Switch on the auto-redirect",
     "On the same page, find the <b>Auto-redirect</b> card. Open the dropdown — "
     "it starts on <b>Off — normal landing page</b> — and choose the link you "
     "just added. Then press the page's <b>Save</b> button. The card shows a "
     "pink <b>ON</b> badge once active.")

step(5, "Leave bot cloaking alone",
     "Directly above is the <b>Bot cloaking</b> card. It is on by default and "
     "must stay on. It is what serves crawlers the decoy blog instead of your "
     "redirect. Only turn it off if an engineer tells you to.")

tip(
    "Only <b>active premium</b> links can be chosen as the target. If the "
    "dropdown is empty, go back to Step 3 — the link is missing, inactive, or "
    "was saved as Social instead of Premium."
)

# ══════════════════════════════════════════════════════════════════════════════
section("4. Verifying it works")
# ══════════════════════════════════════════════════════════════════════════════

body("Do all three checks. They fail in different ways.")

grid([
    ["Check", "How", "Expected"],
    ["It redirects",
     "Open the domain on your phone, in a normal browser.",
     "You land on the OnlyFans page almost immediately."],
    ["It escapes Instagram",
     "Send yourself the domain in an Instagram DM and tap it from inside "
     "Instagram.",
     "It opens in your normal browser (Safari/Chrome), not inside Instagram. "
     "You may see an <i>Open in app?</i> prompt first — that is the phone "
     "asking, and it is expected."],
    ["It is counted",
     "Admin &rarr; Analytics, pick the creator, then that domain's tab.",
     "Your visit appears. Note the domain shows no CTR — see below."],
], [1.3 * inch, 2.6 * inch, 2.6 * inch])

tip(
    "An auto-redirect site deliberately records no page views and no clicks, "
    "because there is no page and nothing to tap. Its CTR will be blank, and "
    "that is correct — it is not broken. Judge these domains by their OnlyFans "
    "numbers instead: clicks and subscribers on the tracking code you gave it."
)

warning(
    "OnlyFans figures are not live. They refresh roughly once a day, overnight. "
    "Do not judge a new domain the same day you create it."
)

# ══════════════════════════════════════════════════════════════════════════════
section("5. Turning it off")
# ══════════════════════════════════════════════════════════════════════════════

body(
    "Open the site, set the <b>Auto-redirect</b> dropdown back to "
    "<b>Off — normal landing page</b>, and Save. The domain immediately goes "
    "back to being an ordinary CharmLink page. Nothing is deleted and the links "
    "stay where they are."
)
body(
    "Deleting or deactivating the target link has the same effect automatically: "
    "the site falls back to a normal landing page rather than breaking."
)

# ══════════════════════════════════════════════════════════════════════════════
section("6. Troubleshooting")
# ══════════════════════════════════════════════════════════════════════════════

grid([
    ["Symptom", "Most likely cause", "Fix"],
    ["The new domain is nowhere in the Creators list",
     "It was created with <b>Add Creator</b> instead of from the person, so it "
     "belongs to nobody and is filtered out of the list.",
     "Open it from Admin &rarr; Analytics (it still appears there), then set "
     "<b>Person</b> on its page and Save."],
    ["Auto-redirect dropdown is empty",
     "No active <b>Premium</b> link on this site.",
     "Add one (Step 3). Check it is Premium, not Social, and is active."],
    ["Domain shows SSL broken",
     "Certificate not issued yet — normal on a new domain.",
     "Press <b>Heal</b> on that row in Admin &rarr; Domains, wait a few minutes, "
     "re-check."],
    ["Opens inside Instagram, not the browser",
     "The escape does not succeed every time; roughly a quarter of attempts "
     "fail. This is a known limit, not a misconfiguration.",
     "Nothing to fix. The visitor still reaches OnlyFans, just inside Instagram."],
    ["Page shows &ldquo;Just a moment&hellip;&rdquo; and stops",
     "The visitor escaped to their browser and then came back to the Instagram "
     "tab.",
     "Expected. A <b>Continue</b> link appears for them to tap."],
    ["No OnlyFans clicks showing",
     "Either the daily sync has not run yet, or the tracking code is shared with "
     "another page.",
     "Wait for the next overnight refresh. If still nothing, confirm the code is "
     "unique to this domain."],
], [1.5 * inch, 2.5 * inch, 2.5 * inch])

# ══════════════════════════════════════════════════════════════════════════════
section("7. Glossary")
# ══════════════════════════════════════════════════════════════════════════════

grid([
    ["Term", "Meaning"],
    ["Person / Model",
     "The creator herself. She owns all of her domains. Photos and identity are "
     "set once on the person and apply everywhere."],
    ["Site",
     "One domain. A person with four domains has four sites in CharmLink. This is "
     "why you add a domain from the person, not by creating a new creator."],
    ["Slug",
     "A site's short internal name. Never seen by visitors when the site has its "
     "own domain."],
    ["Auto-redirect",
     "A site with no landing page that forwards straight to one link."],
    ["Bot cloaking",
     "Serving crawlers a harmless decoy blog instead of the real page. On by "
     "default. Leave it on."],
    ["Escape",
     "Getting a visitor out of Instagram's built-in browser and into their own "
     "browser, where they are already logged in to OnlyFans."],
    ["Tracking code",
     "The <font face='Courier'>/c1234</font> on the end of an OnlyFans link. How "
     "OnlyFans tells you which domain sent a subscriber."],
], [1.4 * inch, 5.1 * inch])

spacer(12)
story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#e0e0e0")))
spacer(6)
body(
    "<font color='#a0a0a0' size='9'>Questions about anything in this document "
    "should go to whoever maintains CharmLink before you change a live domain. "
    "Companion document: CharmLink-Admin-SOP.pdf.</font>"
)

doc.build(story)
print(f"Written: {OUTPUT}")
