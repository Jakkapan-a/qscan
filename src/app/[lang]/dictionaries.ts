import "server-only"
import type en from "./dictionaries/en.json"

/**
 * Translations for the marketing/UI copy. Loaded on the server only, so the JSON
 * never ships in the client bundle; client components receive the slices they need as props.
 * Scan results and API error messages stay in English (technical terms).
 */
const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  th: () => import("./dictionaries/th.json").then((m) => m.default),
}

export type Locale = keyof typeof dictionaries
export type Dictionary = typeof en

export const LOCALES = Object.keys(dictionaries) as Locale[]
export const DEFAULT_LOCALE: Locale = "en"

export const hasLocale = (locale: string): locale is Locale => locale in dictionaries

export const getDictionary = async (locale: Locale): Promise<Dictionary> => dictionaries[locale]()

/** Public path for a locale: the default locale has no prefix ("/"), others do ("/th"). */
export const localePath = (locale: Locale) => (locale === DEFAULT_LOCALE ? "/" : `/${locale}`)

/** Open Graph locale codes. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", th: "th_TH" }
