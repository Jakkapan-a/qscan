import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

/**
 * Allow every crawler, including AI search/answer engines, to read the site,
 * but keep them off the scan API (it performs live network probes).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          "*",
          // AI search and assistant crawlers, listed explicitly so the intent is clear.
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "ClaudeBot",
          "Claude-SearchBot",
          "Google-Extended",
          "Applebot-Extended",
        ],
        allow: "/",
        disallow: "/api/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
