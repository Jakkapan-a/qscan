/**
 * Site-wide constants for metadata, sitemap, robots, JSON-LD and llms.txt.
 * Per-language title/description live in src/app/[lang]/dictionaries/*.json.
 * Override the URL per environment (e.g. preview deployments) with NEXT_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://qscan.meklink.com").replace(/\/$/, "")

export const SITE_NAME = "QScan"

export const REPO_URL = "https://github.com/Jakkapan-a/qscan"
