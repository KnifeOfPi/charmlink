// Self-hosted Google Fonts via next/font/google.
// All fonts are declared at module level (Next.js requirement) and downloaded
// at build time — no runtime CDN requests to fonts.googleapis.com.

import {
  Inter,
  Poppins,
  Playfair_Display,
  Bebas_Neue,
  Montserrat,
  Roboto,
  Lato,
  Open_Sans,
  Raleway,
  Oswald,
  Dancing_Script,
  Pacifico,
  Lobster,
  Quicksand,
  Nunito,
} from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: ["400"], display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const raleway = Raleway({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const pacifico = Pacifico({ subsets: ["latin"], weight: ["400"], display: "swap" });
const lobster = Lobster({ subsets: ["latin"], weight: ["400"], display: "swap" });
const quicksand = Quicksand({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

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
