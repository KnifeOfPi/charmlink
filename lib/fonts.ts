// Creator page fonts, self-hosted from assets/fonts via next/font/local.
//
// These used to come from next/font/google, which downloads ~40 files from
// fonts.gstatic.com during EVERY build; a single failed download fails the
// whole build ("module-not-found … font/google/<name>.module.css"). That
// broke a production deploy on 2026-09-25, a preview on 2026-10-07 and local
// builds in between. The files in assets/fonts are the exact latin-subset
// woff2 files Google serves for these families/weights (most are variable
// fonts, so one file covers 400–700), so rendering is unchanged.
//
// Paths are relative to this file (next/font/local requirement).

import localFont from "next/font/local";

const inter = localFont({ src: "../assets/fonts/inter-var.woff2", weight: "100 900", display: "swap" });
const poppins = localFont({
  src: [
    { path: "../assets/fonts/poppins-400.woff2", weight: "400" },
    { path: "../assets/fonts/poppins-600.woff2", weight: "600" },
    { path: "../assets/fonts/poppins-700.woff2", weight: "700" },
  ],
  display: "swap",
});
const playfair = localFont({
  src: "../assets/fonts/playfair-display-var.woff2",
  weight: "400 900",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const bebasNeue = localFont({ src: "../assets/fonts/bebas-neue-400.woff2", weight: "400", display: "swap" });
const montserrat = localFont({ src: "../assets/fonts/montserrat-var.woff2", weight: "100 900", display: "swap" });
const roboto = localFont({ src: "../assets/fonts/roboto-var.woff2", weight: "100 900", display: "swap" });
const lato = localFont({
  src: [
    { path: "../assets/fonts/lato-400.woff2", weight: "400" },
    { path: "../assets/fonts/lato-700.woff2", weight: "700" },
  ],
  display: "swap",
});
const openSans = localFont({ src: "../assets/fonts/open-sans-var.woff2", weight: "300 800", display: "swap" });
const raleway = localFont({ src: "../assets/fonts/raleway-var.woff2", weight: "100 900", display: "swap" });
const oswald = localFont({ src: "../assets/fonts/oswald-var.woff2", weight: "400 700", display: "swap" });
const dancingScript = localFont({ src: "../assets/fonts/dancing-script-var.woff2", weight: "400 700", display: "swap" });
const pacifico = localFont({ src: "../assets/fonts/pacifico-400.woff2", weight: "400", display: "swap" });
const lobster = localFont({ src: "../assets/fonts/lobster-400.woff2", weight: "400", display: "swap" });
const quicksand = localFont({ src: "../assets/fonts/quicksand-var.woff2", weight: "300 700", display: "swap" });
const nunito = localFont({ src: "../assets/fonts/nunito-var.woff2", weight: "200 1000", display: "swap" });

/** Map from creator font_family key → CSS font-family string */
export const FONT_FAMILY: Record<string, string> = {
  inter: inter.style.fontFamily,
  poppins: poppins.style.fontFamily,
  playfair: playfair.style.fontFamily,
  "playfair-display": playfair.style.fontFamily,
  "bebas-neue": bebasNeue.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  roboto: roboto.style.fontFamily,
  lato: lato.style.fontFamily,
  "open-sans": openSans.style.fontFamily,
  raleway: raleway.style.fontFamily,
  oswald: oswald.style.fontFamily,
  "dancing-script": dancingScript.style.fontFamily,
  pacifico: pacifico.style.fontFamily,
  lobster: lobster.style.fontFamily,
  quicksand: quicksand.style.fontFamily,
  nunito: nunito.style.fontFamily,
};

/** Resolve a creator font key to its CSS font-family, falling back to Inter. */
export function resolveFontFamily(font: string | undefined | null): string {
  if (!font) return FONT_FAMILY.inter;
  return FONT_FAMILY[font] ?? FONT_FAMILY.inter;
}
