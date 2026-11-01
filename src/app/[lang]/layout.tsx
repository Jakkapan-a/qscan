import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import { REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ScanProvider } from "../_components/provider";
import { LOCALES, OG_LOCALE, getDictionary, hasLocale, localePath } from "./dictionaries";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist has no Thai glyphs. Not preloaded: the browser only downloads it when Thai text is on screen.
const notoThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  preload: false,
});

// Prerender every locale at build time (/ and /th stay static).
export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  const ogImage = { url: `/og/${lang}.png`, width: 1200, height: 630, alt: dict.meta.ogAlt };

  return {
    // Resolves relative URLs (canonical, alternates, Open Graph image) to absolute ones.
    metadataBase: new URL(SITE_URL),
    title: { default: dict.meta.title, template: `%s | ${SITE_NAME}` },
    description: dict.meta.description,
    applicationName: SITE_NAME,
    appleWebApp: { title: SITE_NAME },
    authors: [{ name: "Dev", url: REPO_URL }],
    category: "technology",
    keywords: [
      "post-quantum TLS test",
      "ML-KEM checker",
      "X25519MLKEM768",
      "TLS checker",
      "SSL certificate checker",
      "security headers scanner",
      "HSTS",
      "Content-Security-Policy",
    ],
    alternates: {
      canonical: localePath(lang),
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l)])),
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      url: localePath(lang),
      siteName: SITE_NAME,
      title: dict.meta.title,
      description: dict.meta.description,
      locale: OG_LOCALE[lang],
      alternateLocale: LOCALES.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: dict.meta.title,
      description: dict.meta.description,
      images: [ogImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html lang={lang} className={cn(geistSans.variable, geistMono.variable, notoThai.variable, "h-full antialiased")}>
      <body className="@container/content flex min-h-full flex-col">
        <ScanProvider messages={dict.scanner}>{children}</ScanProvider>
      </body>
    </html>
  );
}
