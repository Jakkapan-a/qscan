import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// Mirrors LOCALES / localePath in src/app/[lang]/dictionaries.ts (that module is server-only and
// reads JSON, so keep this route self-contained).
const PAGES = { en: SITE_URL, th: `${SITE_URL}/th` }

export default function sitemap(): MetadataRoute.Sitemap {
  // Each language version lists all alternates (hreflang) so search engines pair them.
  const languages = { ...PAGES, "x-default": SITE_URL }
  return [
    ...Object.values(PAGES).map((url) => ({
      url,
      changeFrequency: "monthly" as const,
      priority: 1,
      alternates: { languages },
    })),
    {
      url: `${SITE_URL}/llms.txt`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ]
}
