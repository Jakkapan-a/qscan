import { REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site"
import type { Dictionary, Locale } from "../[lang]/dictionaries"

/**
 * Static, server-rendered explainer + FAQ. This is the text search engines and
 * AI answer engines index and quote, so keep it short, factual and in sync with the scanner.
 * The same dictionary entries feed the FAQPage JSON-LD below (single source of truth).
 */
export function About({ t }: { t: Dictionary["about"] }) {
  return (
    <section aria-labelledby="about-heading" className="mx-auto mt-24 w-full max-w-4xl text-zinc-300">
      <h2 id="about-heading" className="text-2xl font-semibold tracking-tight text-zinc-50">
        {t.heading}
      </h2>
      <p className="mt-3 leading-relaxed text-zinc-400">{t.intro}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {t.checks.map((c) => (
          <div key={c.title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{c.body}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-16 text-2xl font-semibold tracking-tight text-zinc-50">{t.faqHeading}</h2>
      <div className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
        {t.faq.map((f) => (
          // <details> keeps every answer in the HTML (indexable) while staying compact on screen.
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-zinc-100 marker:hidden">
              <h3>{f.q}</h3>
              <span aria-hidden className="text-indigo-300 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{f.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-6 text-sm text-zinc-500">
        {t.source}{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200">
          GitHub
        </a>
      </p>
    </section>
  )
}

/** schema.org WebApplication + FAQPage, rendered as JSON-LD for search and AI engines. */
export function JsonLd({ lang, description, t }: { lang: Locale; description: string; t: Dictionary["about"] }) {
  const pageUrl = lang === "en" ? SITE_URL : `${SITE_URL}/${lang}`
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: pageUrl,
        description,
        inLanguage: lang,
        applicationCategory: "SecurityApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        sameAs: [REPO_URL],
        featureList: t.checks.map((c) => c.title),
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: lang,
        mainEntity: t.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // Escape "<" so the JSON can never close the script tag (per Next.js JSON-LD guidance).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}
