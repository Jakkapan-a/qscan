"use client";

import type { FormEvent } from "react";
import type { Dictionary } from "../[lang]/dictionaries";
import { useScan } from "./provider";
import { ScanResults } from "./scan-results";

/** Search bar + loading / error / results area. State comes from <ScanProvider>, copy from the dictionary. */
export function Content({ t }: { t: Dictionary["scanner"] }) {
  const { domain, setDomain, state, loading, runScan } = useScan();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runScan(domain);
  }

  return (
    <div className="w-full">
      {/* ---- Search bar ---------------------------------------------------- */}
      <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-2 shadow-2xl shadow-indigo-950/40 focus-within:border-indigo-500/60 sm:flex-row">
          <label htmlFor="domain" className="sr-only">
            {t.label}
          </label>
          <input
            id="domain"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.placeholder}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || domain.trim() === ""}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {loading ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" aria-hidden />
                {t.scanning}
              </>
            ) : (
              t.button
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500">{t.notice}</p>
      </form>

      {/* ---- Status / results --------------------------------------------- */}
      <div className="mt-10" aria-live="polite">
        {state.kind === "loading" && (
          <div className="flex flex-col items-center gap-4 py-16 text-zinc-400">
            <div className="size-12 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-400" aria-hidden />
            <p className="text-center font-mono text-sm">
              {t.probing} <span className="text-indigo-300">{state.domain}</span>: {t.probingDetail}
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-200">
            <p className="font-semibold">{t.failed}</p>
            <p className="mt-1 text-sm text-rose-300/90">{state.message}</p>
          </div>
        )}

        {state.kind === "done" && <ScanResults result={state.result} />}
      </div>
    </div>
  );
}
