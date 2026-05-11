// ─────────────────────────────────────────────────────────────────────────────
// Decoy theme library for bot-only responses.
//
// Goal: when a link-preview scraper / Meta crawler hits a creator domain, we
// return a small, themed, organic-looking page that:
//   1. Has NO Charmlink/Vercel/Next.js fingerprints (no /_next/static, no
//      data-dpl-id, no cl-* identifiers, no shared chunks).
//   2. Looks like a real indie blog post (travel notes, cooking, gardening,
//      etc.) so the page reads as plausible content to Meta's scoring algos.
//   3. Is deterministic per-slug: scraping the same domain repeatedly always
//      yields the same theme/variant (inconsistency would be flagged).
//   4. Differs across slugs: different domains → different themes, so the
//      decoy responses can't be trivially clustered.
//
// The output HTML is built by `decoyHtml(slug)` in this same file. Total
// payload is ~3-5 KB. No external assets are referenced.
// ─────────────────────────────────────────────────────────────────────────────

export interface DecoyVariant {
  title: string;
  description: string;
  body: string[]; // 2-3 paragraphs of body copy
}

export interface DecoyTheme {
  id: string;
  variants: DecoyVariant[];
}

export const DECOY_THEMES: DecoyTheme[] = [
  {
    id: "travel",
    variants: [
      {
        title: "A weekend in Porto: small notes from a slow city",
        description:
          "Two days walking the river, a notebook of cafés and corners worth returning to.",
        body: [
          "I went to Porto without a plan, which is the only way I know how to travel now. The city slopes down to the river in a way that makes every street feel like an accident worth keeping.",
          "There is a small café near São Bento where the espresso costs less than a euro and the owner refuses to let you stand. I sat for an hour and wrote nothing useful, which felt exactly right.",
          "I came back with a notebook full of half-formed ideas and the kind of tiredness you only get from walking too much without thinking about it.",
        ],
      },
      {
        title: "Kyoto in November: temples, leaves, and quiet streets",
        description:
          "An honest journal from five days off the tourist track.",
        body: [
          "By the fifth morning I had stopped trying to see things and started trying to notice them. Kyoto rewards that — the same alley reads differently at 7am and 4pm and the difference is the whole point.",
          "I drank too much tea, walked too far on the Philosopher's Path, and let the leaves do most of the talking. The crowds thin out if you start before breakfast or stay past dusk.",
          "I keep meaning to write a list of recommendations and keep deciding I'd rather not. Some places are better when you find them by accident.",
        ],
      },
      {
        title: "Driving the Oregon coast in shoulder season",
        description:
          "Empty beaches, foggy mornings, and small towns that earn a second visit.",
        body: [
          "We rented a small car and drove south from Astoria with no real itinerary, which turned out to be the right call. November on the Oregon coast belongs to people who don't mind weather.",
          "The diner in Yachats serves clam chowder that ruins every other clam chowder. I won't apologize for that sentence. The fog rolled in around three and stayed.",
          "By the time we got to Bandon I was already planning the next trip. That is how a good coast does its work.",
        ],
      },
    ],
  },
  {
    id: "cooking",
    variants: [
      {
        title: "The everyday pasta dough I keep coming back to",
        description:
          "Notes on hydration, flour ratios, and what I learned from eight bad batches.",
        body: [
          "I am not a precise cook, which is why pasta dough kept frustrating me. After enough bad batches I started weighing the flour and the eggs and the world made more sense almost immediately.",
          "The ratio I land on most weeks is 100g of flour per 55g of egg, with a pinch of salt and a teaspoon of olive oil if I feel like it. Rest the dough for at least thirty minutes, longer if dinner can wait.",
          "Roll it thinner than you think. Cook it less than you think. Salt the water like the sea, like everyone says, because everyone is right about that one.",
        ],
      },
      {
        title: "A bread starter that survived a year of neglect",
        description:
          "Lessons in sourdough patience from a kitchen that isn't precious about it.",
        body: [
          "My starter has spent more time in the fridge than out of it, and it still rises bread every time I ask. Sourdough is far more forgiving than the internet would have you believe.",
          "I feed it the night before, leave it on the counter, and mix dough in the morning. No stretch-and-folds on a schedule, no fancy banneton, no dough thermometer.",
          "The bread is not perfect. It is exactly as good as I need it to be on a Tuesday, which is the only test that matters.",
        ],
      },
      {
        title: "What I learned cooking the same soup for a month",
        description:
          "A small experiment in repetition and what it teaches.",
        body: [
          "I cooked the same minestrone every Sunday for four weeks, changing one thing each time. The first week I started from a recipe. By the fourth I had stopped reading it.",
          "The variables that mattered were salt, time, and the order in which the vegetables went in. The variables that didn't matter were almost everything else, which was the lesson.",
          "I will not be cooking minestrone next Sunday. I might never make it again. But every soup I make now is a little better for the month I spent on this one.",
        ],
      },
    ],
  },
  {
    id: "indie-gamedev",
    variants: [
      {
        title: "Shipping a tiny puzzle game after three years of false starts",
        description:
          "What I learned about scope, playtests, and finally publishing something.",
        body: [
          "I started this project four times. The first three versions died because I kept adding features. The fourth one shipped because I kept removing them.",
          "Playtests with five people in my kitchen taught me more than a year of internal iteration. Watching someone get stuck on a puzzle you thought was easy is a useful kind of pain.",
          "The launch was quiet. A few hundred downloads, a handful of nice emails, one bug report. I am calling it a success and starting the next one smaller.",
        ],
      },
      {
        title: "Why my next game is going to fit on a single screen",
        description:
          "Constraints, scope, and the joy of finishing things.",
        body: [
          "Every game I have abandoned had the same fatal feature: a second screen. Once you have a second screen you have a third, and a save system, and a settings menu, and suddenly you are eighteen months in.",
          "The next one fits on one screen. It has no menus. It has no save slots. It is one idea, expressed as tightly as I can manage.",
          "I will probably break this rule eventually. But it is a good rule for now and it is helping me finish things.",
        ],
      },
    ],
  },
  {
    id: "hiking",
    variants: [
      {
        title: "Five overnight hikes that don't require a permit",
        description:
          "A working list of trails I keep returning to when the planning gets in the way.",
        body: [
          "Permits are a fine system until they aren't. Half the trips I planned last year fell apart because I missed a lottery window by an hour.",
          "These are the routes I default to when I want to be out by the weekend and don't have time to fight a website. None of them are secret. All of them are good.",
          "I am keeping the exact trail list off the public internet because the etiquette here matters. If you ask me in person I'll tell you.",
        ],
      },
      {
        title: "Notes on packing light for shoulder-season backpacking",
        description:
          "What stays in the bag, what comes out, and what I stopped carrying entirely.",
        body: [
          "I used to carry a stove on every overnight. I do not anymore. Cold-soaked oats and a thermos of coffee from the trailhead get me through most one-nighters.",
          "The biggest weight savings did not come from gear. They came from deciding what fears I was packing for. Most of them never showed up.",
          "Bring the puffy. Always bring the puffy. Everything else is negotiable.",
        ],
      },
    ],
  },
  {
    id: "photography",
    variants: [
      {
        title: "A year of shooting one roll of film a week",
        description:
          "What changed when I stopped using my phone for everything.",
        body: [
          "I bought a small rangefinder in January and decided to shoot exactly one roll of 36 a week. By March I was a worse photographer. By August I was a better one.",
          "The constraint did the work. With 36 frames you stop taking pictures of things you already know you don't care about.",
          "I am not going to pretend the film looks better. The film looks like film. What changed was the way I see things between the photos.",
        ],
      },
      {
        title: "Why I stopped editing my photos for two months",
        description:
          "An experiment in trusting the image as it comes.",
        body: [
          "Editing is fun. Editing is also where I lose entire evenings to a slider I cannot feel. So for two months I posted only the JPEG straight from the camera.",
          "The first week was hard. The second week was easier. By the end I had stopped reaching for the laptop after every walk.",
          "I will edit again. But I will edit less, and I will edit later, and I will know more about what I want before I start.",
        ],
      },
    ],
  },
  {
    id: "woodworking",
    variants: [
      {
        title: "The small workbench I built in a weekend",
        description:
          "Dimensioned lumber, two clamps, and a beginner's bench that earned its keep.",
        body: [
          "I have been promising myself a real workbench for years. This weekend I gave up on real and built a small one out of construction lumber and a vise from the hardware store down the street.",
          "It is not beautiful. It is heavy enough to plane on, square enough to mark out from, and tall enough that my back does not complain. That is the entire spec.",
          "The next bench will be better. The next one always is. This one is the one I will actually use.",
        ],
      },
      {
        title: "What hand tools taught me about patience",
        description:
          "Six months of avoiding power tools, and what came back with me.",
        body: [
          "I put the router away in May and did not take it out again until November. In between I built four small pieces and a lot of shavings.",
          "Hand-cut joinery is not faster. It is not even, frankly, better. But it makes you slow down in a way that the router does not, and slowing down was the point.",
          "I am back on power tools now. I am also a noticeably better woodworker, which is the only review of an experiment that matters.",
        ],
      },
    ],
  },
  {
    id: "language",
    variants: [
      {
        title: "Six months of learning Portuguese twenty minutes a day",
        description:
          "What stuck, what didn't, and what I'd skip if I started over.",
        body: [
          "I started Portuguese in January with a flashcard app and a notebook. Six months later I can read a menu, follow a slow conversation, and embarrass myself at a bakery in a way the locals seem to enjoy.",
          "The flashcards were useful for two months and then stopped being useful. The notebook is still useful. Speaking to a tutor twice a week was worth more than every app combined.",
          "If I started over I would skip the first three weeks of grammar and go straight to listening. Grammar shows up when you need it.",
        ],
      },
      {
        title: "Reading a novel in your second language, badly",
        description:
          "Notes on a deliberately uncomfortable kind of practice.",
        body: [
          "I am reading a novel in Spanish that is slightly beyond me. I look up maybe one word a page, which is exactly the wrong amount to be efficient and the exactly the right amount to be uncomfortable.",
          "After 80 pages the world has started to settle. Sentences I would have looked up in March I now glide past in October. The grammar is not the point. The momentum is.",
          "I do not know what the book is about. I will when I am done. That is the only deadline.",
        ],
      },
    ],
  },
  {
    id: "gardening",
    variants: [
      {
        title: "What grew, what didn't, and what the slugs ate this year",
        description:
          "A small annual review from a north-facing back garden.",
        body: [
          "The tomatoes were a disappointment again, which is mostly the fault of the geography and partly the fault of the gardener. The beans more than made up for it.",
          "I tried four varieties of basil and only one of them survived the first cold snap. I cannot remember which one. I will buy four again next year and find out.",
          "Garlic in October, peas in March, basil in May, and patience the whole way through. The rest is weather.",
        ],
      },
      {
        title: "Composting in a small flat: a slightly tedious how-to",
        description:
          "What I learned the hard way about indoor composting.",
        body: [
          "I have been composting in a small kitchen for two years. The first year was a smell. The second year was a system. The system is what I should have started with.",
          "Two buckets, a layer of dry material between every wet addition, and a willingness to take it out every three days. That is it.",
          "It will not save the planet. It will keep your kitchen smelling like a kitchen and put a small amount of soil back into the ground, which is enough.",
        ],
      },
    ],
  },
  {
    id: "cycling",
    variants: [
      {
        title: "A 120-mile weekend on a fully loaded touring bike",
        description:
          "Notes from a slow ride that taught me what I actually need.",
        body: [
          "I packed too much and rode too slow and had a wonderful time. The first day was twice as hard as I expected. The second was easier than I deserved.",
          "I will not bring the second pair of shoes again. I will bring more chamois cream. The stove was useful exactly once. The book stayed in the pannier the whole weekend.",
          "Next trip is shorter, slower, and somewhere I do not have to drive to. Touring is best when the start line is the front door.",
        ],
      },
      {
        title: "The cheap commuter bike that lasted seven years",
        description:
          "A small love letter to a fender, a rack, and a frame that asked for nothing.",
        body: [
          "I bought a steel commuter for £400 in 2018 and rode it to work every day until last spring. It needed two chains, one set of cables, and a new bottom bracket. That is the entire maintenance bill.",
          "Cheap bikes get a bad name from people who buy the wrong cheap bikes. The right one is a steel frame, a rack, and tyres that do not panic in the rain.",
          "I have a nicer bike now. I miss the old one more than I expected.",
        ],
      },
    ],
  },
  {
    id: "journaling",
    variants: [
      {
        title: "What two years of morning pages actually did for me",
        description:
          "An honest review of a habit I did not expect to keep.",
        body: [
          "I started morning pages because a friend would not stop recommending them. Two years later I am still doing it, which is the longest I have stuck with anything that does not have a finish line.",
          "Most of what I write is forgettable, which is the point. The pages are a sieve. The good ideas settle, and the rest goes down the drain before it gets in the way.",
          "I do not recommend the practice loudly. But if you have been told to try it, and you keep not trying it, this is your reminder.",
        ],
      },
      {
        title: "Switching from a notebook to a single text file",
        description:
          "Six months of plain text and what I gained by losing the paper.",
        body: [
          "I love notebooks. I have a stack of them. I also could never find anything in them, which made the love a one-way relationship.",
          "Six months ago I switched to one text file with a date heading per day. I can search it. I can grep it. I can find the line I wrote on a train in March and I could not before.",
          "I still keep a notebook for meetings. The text file is for me. The split has been quietly, surprisingly good.",
        ],
      },
    ],
  },
];

// ─── Slug → theme/variant mapping (stable, deterministic) ────────────────────
function hashSlug(slug: string): number {
  // FNV-1a-ish 32-bit hash. Deterministic across runtimes (no String.hashCode
  // dependency). Same input → same output forever.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface PickedDecoy {
  themeId: string;
  title: string;
  description: string;
  body: string[];
}

export function pickDecoyTheme(slug: string): PickedDecoy {
  const lower = (slug || "").toLowerCase();
  const h = hashSlug(lower || "default");
  const theme = DECOY_THEMES[h % DECOY_THEMES.length];
  // Use a different byte for the variant selection so theme and variant aren't
  // perfectly correlated.
  const variant = theme.variants[(h >>> 11) % theme.variants.length];
  return {
    themeId: theme.id,
    title: variant.title,
    description: variant.description,
    body: variant.body,
  };
}

// ─── HTML rendering ──────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a small, organic-looking decoy HTML page for `slug`.
 *
 * This is the entire response body served to confirmed bots — it is NOT
 * rendered through Next.js, so there is no `data-dpl-id`, no `/_next/static/`
 * chunk references, no Charmlink-prefixed identifiers, and no font loads.
 */
export function decoyHtml(slug: string): string {
  const d = pickDecoyTheme(slug);
  const title = escapeHtml(d.title);
  const description = escapeHtml(d.description);
  const bodyParas = d.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<link rel="icon" href="data:,">
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222;background:#fff}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 .5rem}
.lede{color:#555;font-style:italic;margin:0 0 1.5rem}
article p{margin:0 0 1rem}
footer{margin-top:2rem;color:#888;font-size:.85rem;border-top:1px solid #eee;padding-top:1rem}
</style>
</head>
<body>
<h1>${title}</h1>
<p class="lede">${description}</p>
<article>
${bodyParas}
</article>
<footer>Posted on a small personal blog. Comments closed.</footer>
</body>
</html>
`;
}
