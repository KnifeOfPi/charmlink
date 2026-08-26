#!/usr/bin/env python3
"""CharmLink click-conversion analysis — PDF report generator."""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle, KeepTogether,
)

OUT = "/home/user/charmlink/docs/CLICK-CONVERSION-ANALYSIS-2026-08-26.pdf"

INK      = colors.HexColor("#16161a")
MUTED    = colors.HexColor("#5c5c6b")
FAINT    = colors.HexColor("#8a8a99")
ACCENT   = colors.HexColor("#c2185b")
RULE     = colors.HexColor("#d8d8e0")
BAND     = colors.HexColor("#f4f4f7")
BAD      = colors.HexColor("#b3261e")
GOOD     = colors.HexColor("#1b6b3a")

styles = getSampleStyleSheet()


def S(name, **kw):
    return ParagraphStyle(name, **kw)


TitleS = S("TitleS", fontName="Helvetica-Bold", fontSize=23, leading=27,
           textColor=INK, spaceAfter=5)
SubS = S("SubS", fontName="Helvetica", fontSize=10.5, leading=15,
         textColor=MUTED, spaceAfter=2)
MetaS = S("MetaS", fontName="Helvetica", fontSize=8.5, leading=12,
          textColor=FAINT)
H1 = S("H1", fontName="Helvetica-Bold", fontSize=13, leading=16,
       textColor=INK, spaceBefore=17, spaceAfter=7)
H2 = S("H2", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
       textColor=INK, spaceBefore=11, spaceAfter=4)
Body = S("Body", fontName="Helvetica", fontSize=9.7, leading=14.4,
         textColor=INK, alignment=TA_LEFT, spaceAfter=7)
Small = S("Small", fontName="Helvetica", fontSize=8.4, leading=12,
          textColor=MUTED, spaceAfter=5)
Bullet = S("Bullet", parent=Body, leftIndent=13, bulletIndent=3, spaceAfter=4.5)
CellL = S("CellL", fontName="Helvetica", fontSize=9, leading=12.2, textColor=INK)
CellLB = S("CellLB", fontName="Helvetica-Bold", fontSize=9, leading=12.2, textColor=INK)
CellHd = S("CellHd", fontName="Helvetica-Bold", fontSize=8.2, leading=11,
           textColor=colors.white)
Pull = S("Pull", fontName="Helvetica-Bold", fontSize=11, leading=15.5,
         textColor=INK, leftIndent=11, rightIndent=9, spaceBefore=3, spaceAfter=3)


def rule(space_before=3, space_after=9):
    t = Table([[""]], colWidths=[7.0 * inch], rowHeights=[0.5])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), space_before),
        ("BOTTOMPADDING", (0, 0), (-1, -1), space_after),
    ]))
    return t


def callout(text, tone=ACCENT):
    p = Paragraph(text, Pull)
    t = Table([[p]], colWidths=[7.0 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BAND),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, tone),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def datatable(header, rows, widths, aligns=None, emphasis_rows=(),
              emphasis_color=BAD):
    data = [[Paragraph(h, CellHd) for h in header]]
    for r in rows:
        data.append([Paragraph(str(c), CellL) for c in r])

    st = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fafafc")))
    if aligns:
        for col, al in enumerate(aligns):
            st.append(("ALIGN", (col, 0), (col, -1), al))
    emph_style = S("CellEmph", fontName="Helvetica-Bold", fontSize=9,
                   leading=12.2, textColor=emphasis_color)
    for r in emphasis_rows:
        st.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#fdeeec")))
        for c in range(len(header)):
            data[r][c] = Paragraph(data[r][c].text, emph_style)
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(st))
    return t


def bullets(items, style=Bullet):
    return [Paragraph(x, style, bulletText="•") for x in items]


story = []

# ── Cover block ───────────────────────────────────────────────────────────
story.append(Paragraph("Why clicks aren’t converting", TitleS))
story.append(Paragraph(
    "CharmLink premium-link funnel analysis — measured against production",
    SubS))
story.append(Spacer(1, 7))
story.append(Paragraph(
    "26 August 2026 &nbsp;·&nbsp; Data window 22 Mar – 26 Aug 2026 &nbsp;·&nbsp; "
    "708,845 events &nbsp;·&nbsp; Source: <font face='Courier'>charmlink_events</font>, "
    "<font face='Courier'>honeypot_logs</font> (Supabase project "
    "<font face='Courier'>vhdgfcrjjscnhcdsqsgs</font>)", MetaS))
story.append(rule(6, 12))

# ── Summary ───────────────────────────────────────────────────────────────
story.append(Paragraph("Summary", H1))
story.append(Paragraph(
    "There is a real, fixable technical barrier between a click and OnlyFans — "
    "but it accounts for roughly a fifth of the gap, not all of it. "
    "<b>About one in eight recorded “premium clicks” is a tap on a link that "
    "cannot reach OnlyFans by construction.</b> The remaining ~84% do arrive. "
    "If conversions are near zero rather than merely lower than expected, the "
    "destination page is also a factor.", Body))
story.append(Paragraph(
    "The reported click number is inflated by <b>~19%</b>. The true figure for "
    "the measured window is approximately <b>169,300</b>, not 202,198.", Body))

story.append(callout(
    "The bot trap was catching humans. Of 33,517 honeypot hits, 86.6% carried "
    "mobile browser user-agents and 0.12% carried bot user-agents — and every "
    "hit banned that IP for 24 hours."))

# ── Finding 1 ─────────────────────────────────────────────────────────────
story.append(Paragraph("1. The honeypot was a human trap", H1))
story.append(Paragraph(
    "When a request to <font face='Courier'>POST /api/links/[creator]</font> "
    "failed any of its gates, the API returned a payload containing exactly one "
    "visible link, labelled “Loading…”, pointing at "
    "<font face='Courier'>/api/honeypot</font>. A real visitor who was falsely "
    "rejected saw a page with one tappable item on it and tapped it.", Body))
story.append(datatable(
    ["Honeypot evidence (10 May – 26 Aug 2026)", "Value", "Read"],
    [
        ["Total hits", "33,517", "—"],
        ["Distinct IPs banned", "8,712", "24h lockout each"],
        ["Hits per IP", "3.85", "banned users re-banned"],
        ["Mobile browser user-agents", "29,028 (86.6%)", "real people"],
        ["Bot user-agents", "41 (0.12%)", "intended targets"],
    ],
    widths=[3.5 * inch, 1.7 * inch, 1.8 * inch],
    aligns=["LEFT", "RIGHT", "LEFT"],
    emphasis_rows=[5],
))
story.append(Spacer(1, 7))
story.append(Paragraph(
    "The failure was self-reinforcing. A banned IP is served the decoy page by "
    "middleware, so the visitor’s next attempt produced another rejection, "
    "another “Loading…” link, and another ban. The 3.85 hits-per-IP average is "
    "that loop. On carrier-grade NAT a single banned address can front "
    "thousands of subscribers.", Body))

# ── Finding 2 ─────────────────────────────────────────────────────────────
story.append(KeepTogether([
    Paragraph("2. The click funnel, measured", H1),
    datatable(
        ["Outcome", "Clicks", "Share"],
        [
            ["Reached OnlyFans — direct navigation", "162,967", "80.6%"],
            ["Reached OnlyFans — via /r/ interstitial", "6,355", "3.1%"],
            ["Trapped in the honeypot decoy", "25,522", "12.6%"],
            ["Abandoned at age gate", "79", "0.04%"],
            ["Total recorded premium clicks", "202,198", "100%"],
        ],
        widths=[4.0 * inch, 1.5 * inch, 1.5 * inch],
        aligns=["LEFT", "RIGHT", "RIGHT"],
        emphasis_rows=[3],
    ),
]))
story.append(Spacer(1, 7))
story.append(Paragraph(
    "Two distinct effects inflate the headline number: <b>12.6%</b> are dead "
    "clicks that never leave the site, and a further <b>~3%</b> are the "
    "interstitial path being counted twice — once when the link is tapped, "
    "again when the redirect completes.", Body))

story.append(KeepTogether([
    Paragraph("Trend since the decoy shipped", H2),
    datatable(
        ["Month", "Reached OF", "Trapped", "% trapped"],
        [
            ["March 2026", "267", "0", "0.0%"],
            ["April 2026", "190", "0", "0.0%"],
            ["May 2026", "5,784", "828", "12.0%"],
            ["June 2026", "62,635", "11,973", "14.9%"],
            ["July 2026", "55,547", "6,968", "11.1%"],
            ["August 2026", "44,850", "5,753", "11.3%"],
        ],
        widths=[2.2 * inch, 1.7 * inch, 1.5 * inch, 1.6 * inch],
        aligns=["LEFT", "RIGHT", "RIGHT", "RIGHT"],
    ),
    Spacer(1, 6),
    Paragraph(
        "Zero before May, then double digits from the moment the hardened links "
        "API went live, sustained for four months.", Small),
]))

# ── Finding 3 ─────────────────────────────────────────────────────────────
story.append(Paragraph("3. Why real users were being rejected", H1))
story.append(Paragraph(
    "The likeliest driver, given that 86.6% of trapped traffic is mobile and it "
    "spans 95 countries, is that <b>the HMAC link token was bound to the client "
    "IP address</b>.", Body))
story.append(Paragraph(
    "The token was minted during server rendering using the IP of that request, "
    "then verified against the IP of the browser’s follow-up POST moments later. "
    "On mobile networks those two addresses frequently differ — WiFi/cellular "
    "handoff, carrier NAT rotation, IPv6 privacy addressing, CDN edge variance. "
    "Every mismatch failed verification and dropped a genuine visitor into the "
    "rejection path described above. A secondary contributor is the 30-requests-"
    "per-minute rate limit, also keyed on a shared IP.", Body))

# ── Disproven ─────────────────────────────────────────────────────────────
story.append(KeepTogether([
    Paragraph("4. Hypotheses the data ruled out", H1),
    Paragraph(
        "Three plausible explanations were tested and eliminated. Recording them "
        "so they are not re-investigated:", Body),
    datatable(
        ["Hypothesis", "Verdict", "Evidence"],
        [
            ["Bare <font face='Courier'>onlyfans://</font> deep link discards the "
         "creator’s profile path",
         "Not active",
         "<font face='Courier'>deeplink_enabled</font> is false on all 107 "
         "active premium links"],
        ["Age-gate friction is losing visitors",
         "Immaterial",
         "Only 3 of 107 links are gated; 98.8% completion "
         "(6,434 → 6,355)"],
        ["Age-confirm rate limit traps users in a loop",
         "Not at scale",
         "Real defect in code, but only 79 abandonments total"],
    ],
    widths=[2.9 * inch, 1.15 * inch, 2.95 * inch],
        aligns=["LEFT", "LEFT", "LEFT"],
    ),
]))
story.append(Spacer(1, 7))
story.append(Paragraph(
    "<b>Still unquantified.</b> The <font face='Courier'>x-safari-https://</font> "
    "scheme — dead since iOS 14.5 — remains on the live path for iOS Instagram "
    "clicks on non-sensitive links, which is 104 of 107 links. Its drop-off "
    "cannot be measured from the events table.", Body))

# ── Measurement caveats ───────────────────────────────────────────────────
story.append(Paragraph("5. Two caveats on the dashboard numbers", H1))
for p in bullets([
    "<b>Bot views are structurally zero.</b> <font face='Courier'>is_bot</font> "
    "is hard-coded false on every click event, and page views take the flag from "
    "the client, which always sends false. All 708,845 events carry "
    "<font face='Courier'>is_bot = false</font>. The “Bot Views” metric has never "
    "reported anything.",
    "<b>Page views are likely double-counted for Instagram.</b> Instagram is 43.9% "
    "of page views but only 10.5% of clicks. The probable cause is the automatic "
    "in-app-browser escape: the WebView records one view, hands off to Safari, "
    "which records a second, and the click lands there. This would inflate the "
    "denominator of every CTR figure. Strong hypothesis, not yet verified — it "
    "needs session-level correlation to confirm.",
]):
    story.append(p)

# ── Fixes ─────────────────────────────────────────────────────────────────
story.append(Paragraph("6. Changes shipped", H1))
story.append(Paragraph(
    "Committed to <font face='Courier'>claude/repo-review-ed7w66</font> as "
    "<font face='Courier'>c7460a7</font>. Type-check, production build and lint "
    "all pass; a token round-trip suite covers the new scheme and both "
    "legacy-fallback directions.", Body))
story.append(KeepTogether([datatable(
    ["#", "Change", "Effect"],
    [
        ["1", "Rejection payload is now an empty list instead of a followable "
              "honeypot link",
              "Removes the trap entirely — the 12.6%"],
        ["2", "Link tokens no longer bound to client IP; legacy tokens still "
              "accepted during rollout",
              "Stops rejecting real mobile visitors in the first place"],
        ["3", "Honeypot bans only when the request looks automated, never on "
              "<font face='Courier'>ref=d1</font>",
              "Ends the 24h lockouts and the re-ban loop"],
    ],
    widths=[0.35 * inch, 3.75 * inch, 2.9 * inch],
    aligns=["CENTER", "LEFT", "LEFT"],
)]))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "The genuine trap — an off-screen, <font face='Courier'>aria-hidden</font>, "
    "non-tabbable anchor that no real user can reach — is untouched and still "
    "logs every hit, so monitoring value is preserved.", Small))

# ── Recommendations ───────────────────────────────────────────────────────
_recs = bullets([
    "<b>Do not treat this as an OnlyFans page-optimisation problem yet.</b> "
    "Give the three fixes a week in production first. Any visitor banned during "
    "the affected period was seeing a decoy page, so their true reach rate is "
    "currently unknowable.",
    "<b>Re-baseline the click metric.</b> Historical premium clicks are ~19% "
    "high. Comparisons that straddle the fix date will show an apparent drop "
    "that is really the phantom clicks disappearing.",
    "<b>Deduplicate click tracking</b> so one journey counts once — the "
    "interstitial path currently records both the tap and the redirect.",
    "<b>Fix the reporting defects:</b> stop hard-coding "
    "<font face='Courier'>is_bot</font>, and confirm the Instagram "
    "double-count before trusting any CTR figure.",
    "<b>Remove the dead <font face='Courier'>x-safari-https://</font> scheme</b> "
    "from the iOS Instagram click path.",
])
# Keep the heading welded to its first recommendation so it never orphans.
story.append(KeepTogether([Paragraph("7. What to do next", H1), _recs[0]]))
for p in _recs[1:]:
    story.append(p)

story.append(Spacer(1, 13))
story.append(rule(0, 6))
story.append(Paragraph(
    "All figures are aggregate queries run directly against the production "
    "database on 26 August 2026. No individual event rows or personal data were "
    "extracted. Row counts and percentages are reproducible from the queries "
    "recorded in the engineering session transcript.", MetaS))


# ── Page furniture ────────────────────────────────────────────────────────
def decorate(canvas, doc):
    canvas.saveState()
    w, _ = LETTER
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(FAINT)
    canvas.drawString(0.75 * inch, 0.52 * inch,
                      "CharmLink — click-conversion analysis")
    canvas.drawRightString(w - 0.75 * inch, 0.52 * inch, f"{doc.page}")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(0.75 * inch, 0.72 * inch, w - 0.75 * inch, 0.72 * inch)
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=LETTER,
    leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    topMargin=0.7 * inch, bottomMargin=0.85 * inch,
    title="CharmLink — Why clicks aren't converting",
    author="CharmLink engineering",
    subject="Premium-link funnel analysis, 22 Mar – 26 Aug 2026",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=decorate)])
doc.build(story)
print(f"wrote {OUT}")
