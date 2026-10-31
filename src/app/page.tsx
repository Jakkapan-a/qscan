import Image from "next/image";
import { Main } from "@/components/layouts/main";
import { Content } from "./_components/content";
import pkg from "../../package.json";

export default function Home() {
  return (
    <Main className="relative flex w-full flex-1 flex-col py-12 sm:py-20">
      {/* Subtle grid backdrop for the "cyberpunk-lite" feel */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,#27272a40_1px,transparent_1px),linear-gradient(to_bottom,#27272a40_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />

      <header className="mb-10 text-center">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 font-mono text-xs text-indigo-300">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          TLS · Certificates · Post-Quantum · Headers
        </p>
        <h1>
          {/* The PNG is 887×887 with the wordmark in a ~887×280 band; the wrapper's aspect ratio crops the
              transparent padding (object-cover, centred). Dark variant: the site is dark-only. */}
          <span className="relative mx-auto block aspect-887/280 w-64 overflow-hidden sm:w-80">
            <Image
              src="/logo/qscan_dark.png"
              alt="QScan"
              fill
              sizes="(min-width: 640px) 320px, 256px"
              loading="eager"
              fetchPriority="high"
              className="object-cover"
            />
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-400">
          Check a website&apos;s TLS configuration, certificate health, ML-KEM post-quantum readiness and HTTP security
          headers in seconds.
        </p>
      </header>

      <Content />

      <footer className="mt-auto pt-16 text-center text-xs text-zinc-600">
        Scans connect to port 443 of public hosts only. Results reflect the scanner&apos;s point of view at scan time.
        <p className="mt-2 font-mono text-[11px] text-zinc-700">
          <a href={pkg.homepage} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-300">
            QScan v{pkg.version}
          </a>
        </p>
      </footer>
    </Main>
  );
}
