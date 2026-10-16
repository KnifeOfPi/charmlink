/**
 * Regression check for creator slug / domain normalization.
 *   npm run check:slug
 */
import { cleanCreatorFields, normalizeDomain, normalizeSlug, slugError } from "../lib/slug";

let failed = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

// 2026-10-15: "Account 2" from the person page's add-site form.
expect('"Account 2" → account-2', normalizeSlug("Account 2"), "account-2");
expect('"  Holly XO! " → holly-xo', normalizeSlug("  Holly XO! "), "holly-xo");
expect("existing style kept", normalizeSlug("jasmineteaaa"), "jasmineteaaa");
expect("underscore kept", normalizeSlug("my_site"), "my_site");
expect("empty after cleaning is rejected", slugError(normalizeSlug("!!!")) !== null, true);
expect("reserved 'admin' rejected", slugError("admin") !== null, true);
expect("65 chars rejected", slugError("a".repeat(65)) !== null, true);

expect("domain: scheme/path/case stripped", normalizeDomain("https://WWW.Example.com/path?x=1"), "www.example.com");
expect("domain: blank → null", normalizeDomain("  "), null);

const create: Record<string, unknown> = { slug: "Account 2", custom_domain: " AllAboutSarahWylde.com " };
expect("create body cleaned", [cleanCreatorFields(create, { requireSlug: true }), create.slug, create.custom_domain], [null, "account-2", "allaboutsarahwylde.com"]);
expect("create without slug rejected", cleanCreatorFields({ name: "x" }, { requireSlug: true }) !== null, true);
const update: Record<string, unknown> = { tagline: "hi" };
expect("partial update untouched", [cleanCreatorFields(update, { requireSlug: false }), update], [null, { tagline: "hi" }]);
expect("bad domain rejected", cleanCreatorFields({ custom_domain: "not a domain" }, { requireSlug: false }) !== null, true);
const clear: Record<string, unknown> = { custom_domain: "" };
expect("clearing domain → null", [cleanCreatorFields(clear, { requireSlug: false }), clear.custom_domain], [null, null]);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
