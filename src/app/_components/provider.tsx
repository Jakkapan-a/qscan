"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ScanErrorBody, ScanResult } from "@/lib/scan/types";
import type { Dictionary } from "../[lang]/dictionaries";

/** Client-side ceiling; slightly above the API route's maxDuration. */
const CLIENT_TIMEOUT_MS = 35_000;

/** URL query parameter holding the scanned domain, e.g. /?s=example.com */
const QUERY_KEY = "s";

export type ScanState =
  | { kind: "idle" }
  | { kind: "loading"; domain: string }
  | { kind: "error"; message: string }
  | { kind: "done"; result: ScanResult };

interface ScanContextValue {
  domain: string;
  setDomain: (value: string) => void;
  state: ScanState;
  loading: boolean;
  /** Validate, call POST /api/scan and store the result or error. */
  runScan: (target: string) => Promise<void>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

/** Cheap client-side pre-check; the server performs the authoritative validation. */
function looksLikeDomain(value: string) {
  const host = value.trim().replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  return /^[^\s.]+(\.[^\s.]+)+$/.test(host);
}

/** Localised client-side error messages (API errors come back in English from the server). */
type ScanMessages = Pick<Dictionary["scanner"], "invalidDomain" | "timeout" | "network">;

/** Holds scan state and the API call so any component under it can trigger or read a scan. */
export function ScanProvider({ children, messages }: { children: ReactNode; messages: ScanMessages }) {
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function runScan(target: string) {
    setDomain(target); // keep the input box in sync with what is being scanned
    if (!looksLikeDomain(target)) {
      setState({ kind: "error", message: messages.invalidDomain });
      return;
    }

    // Mirror the domain into ?s= so a refresh (F5) or shared link re-runs the same scan.
    // Native replaceState is integrated with the Next.js router (no navigation, no re-render).
    const url = new URL(window.location.href);
    url.searchParams.set(QUERY_KEY, target.trim());
    window.history.replaceState(window.history.state, "", url);

    // Cancel any in-flight scan before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);

    setState({ kind: "loading", domain: target.trim() });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target }),
        signal: controller.signal,
      });

      // Guard against HTML error pages from proxies / platform timeouts.
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data as ScanErrorBody | null)?.error ?? `Scan failed (HTTP ${res.status}).`;
        setState({ kind: "error", message });
        return;
      }
      setState({ kind: "done", result: data as ScanResult });
    } catch {
      if (controller.signal.aborted && !timedOut) return; // superseded by a newer scan
      setState({
        kind: "error",
        message: timedOut ? messages.timeout : messages.network,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // On first load, restore a scan from ?s= (after F5 or opening a shared link).
  // Read from window.location instead of useSearchParams so the page stays prerendered
  // without needing a <Suspense> boundary (required for useSearchParams under Cache Components).
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get(QUERY_KEY)?.trim();
    // One-time sync from an external system (the URL) on mount; the single extra render is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) runScan(initial);
    // Mount-only on purpose: re-running when runScan's identity changes would re-trigger the scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScanContext value={{ domain, setDomain, state, loading: state.kind === "loading", runScan }}>
      {children}
    </ScanContext>
  );
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used inside <ScanProvider>");
  return ctx;
}
