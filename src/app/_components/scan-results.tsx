import type { ReactNode } from "react";
import type { Finding, ScanResult } from "@/lib/scan/types";
import { cn, formatDate } from "@/lib/utils";
import { GradeBadge, StatusBadge } from "./badges";

/** Generic dashboard card with a title row and optional status badge. */
function Card({ title, badge, children, className }: { title: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur", className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">{title}</h2>
        {badge}
      </header>
      {children}
    </section>
  );
}

/** Label/value row used inside cards. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800/70 py-2 last:border-0">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-sm wrap-break-word text-zinc-100">{children}</dd>
    </div>
  );
}

const FINDING_STYLES: Record<Finding["severity"], { dot: string; text: string }> = {
  critical: { dot: "bg-rose-500", text: "text-rose-200" },
  warning: { dot: "bg-amber-400", text: "text-amber-100" },
  info: { dot: "bg-indigo-400", text: "text-zinc-300" },
  good: { dot: "bg-emerald-400", text: "text-emerald-100" },
};

export function ScanResults({ result }: { result: ScanResult }) {
  const { tls, certificate: cert, headers } = result;
  const days = cert.daysRemaining;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ---- Overview / grade ------------------------------------------------ */}
      <Card title="Security Score" className="lg:col-span-1">
        <GradeBadge grade={result.grade} score={result.score} />
        <dl className="mt-5">
          <Row label="Host">{result.domain}</Row>
          <Row label="IP address">{result.ip}</Row>
          <Row label="Scan time">{(result.durationMs / 1000).toFixed(1)}s</Row>
        </dl>
      </Card>

      {/* ---- Findings summary ------------------------------------------------ */}
      <Card title="Findings" className="lg:col-span-2">
        <ul className="space-y-2">
          {result.findings.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", FINDING_STYLES[f.severity].dot)} />
              <span className={FINDING_STYLES[f.severity].text}>{f.message}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ---- TLS protocol versions ------------------------------------------ */}
      <Card title="TLS Protocols">
        <ul className="space-y-2">
          {tls.versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-sm text-zinc-100">{v.label}</p>
                <p className="truncate text-xs text-zinc-500">{v.supported ? v.cipher : v.note ?? "Not offered"}</p>
              </div>
              <StatusBadge
                status={v.status}
                label={v.status === "UNKNOWN" ? "UNKNOWN" : v.supported ? "ENABLED" : "DISABLED"}
              />
            </li>
          ))}
        </ul>
        <dl className="mt-4">
          <Row label="Negotiated">{tls.negotiatedProtocol}</Row>
          <Row label="Cipher">{tls.negotiatedCipher}</Row>
        </dl>
      </Card>

      {/* ---- Post-quantum --------------------------------------------------- */}
      <Card
        title="Post-Quantum (ML-KEM)"
        badge={<StatusBadge status={tls.pqc.status} label={tls.pqc.supported ? "PQC READY" : tls.pqc.supported === false ? "NOT SUPPORTED" : "UNKNOWN"} />}
      >
        <p className="mb-4 text-sm text-zinc-400">
          Hybrid ML-KEM key exchange (FIPS 203) protects today&apos;s traffic against future quantum decryption.
        </p>
        <ul className="space-y-2">
          {tls.pqc.groups.map((g) => (
            <li key={g.name} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 px-3 py-2.5">
              <div className="min-w-0">
                <p className={cn("font-mono text-sm text-zinc-200", g.name === "X25519MLKEM768" && "text-indigo-200")}>{g.name}</p>
                {g.note && <p className="truncate text-xs text-zinc-500">{g.note}</p>}
              </div>
              <StatusBadge
                status={g.supported ? "SECURE" : g.supported === null ? "UNKNOWN" : "MISSING"}
                label={g.supported ? "NEGOTIATED" : g.supported === null ? "UNTESTED" : "NO"}
              />
            </li>
          ))}
        </ul>
      </Card>

      {/* ---- Certificate ---------------------------------------------------- */}
      <Card title="Certificate" badge={<StatusBadge status={cert.status} label={cert.status === "SECURE" ? "VALID" : cert.status} />}>
        <dl>
          <Row label="Subject">{cert.subject}</Row>
          <Row label="Issuer">
            {cert.issuerOrg ? (
              <>
                {cert.issuerOrg}
                <span className="block text-xs text-zinc-500">{cert.issuer}</span>
              </>
            ) : (
              cert.issuer
            )}
          </Row>
          <Row label="Expires">
            {formatDate(cert.validTo)}
            <span className={cn("block text-xs text-emerald-400", days < 14 && "text-amber-400", days < 0 && "text-rose-400")}>
              {days < 0 ? `expired ${-days} days ago` : `${days} days remaining`}
            </span>
          </Row>
          <Row label="Key">
            <span className="inline-flex items-center gap-2">
              {cert.keyLabel}
              <StatusBadge status={cert.keyStatus} label={cert.keyStatus === "SECURE" ? "STRONG" : cert.keyStatus} />
            </span>
          </Row>
          <Row label="Trusted chain">
            <StatusBadge status={cert.trusted ? "SECURE" : "VULNERABLE"} label={cert.trusted ? "YES" : "NO"} />
          </Row>
          <Row label="Hostname match">
            <StatusBadge status={cert.hostnameMatch ? "SECURE" : "VULNERABLE"} label={cert.hostnameMatch ? "YES" : "NO"} />
          </Row>
        </dl>
        {cert.trustError && <p className="mt-3 font-mono text-xs text-rose-300">{cert.trustError}</p>}
        {cert.san.length > 0 && (
          <details className="mt-3 text-xs text-zinc-400">
            <summary className="cursor-pointer text-indigo-300 hover:text-indigo-200">
              {cert.san.length} Subject Alternative Name{cert.san.length > 1 ? "s" : ""}
            </summary>
            <p className="mt-2 font-mono break-all text-zinc-500">{cert.san.join(", ")}</p>
          </details>
        )}
      </Card>

      {/* ---- HTTP security headers ------------------------------------------ */}
      <Card
        title="HTTP Security Headers"
        className="lg:col-span-3"
        badge={
          <span className="max-w-[60%] truncate font-mono text-xs text-zinc-500" title={headers.finalUrl}>
            {headers.statusCode > 0 ? `${headers.statusCode} · ` : ""}
            {headers.finalUrl}
          </span>
        }
      >
        {headers.error && <p className="mb-3 text-sm text-rose-300">Could not fetch headers: {headers.error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {headers.items.map((h) => (
            <div key={h.short} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm text-zinc-100">{h.name}</p>
                <StatusBadge status={h.status} label={h.status === "SECURE" ? "PROTECTED" : h.status} />
              </div>
              <p className="mt-1 text-sm text-zinc-400">{h.note}</p>
              {h.value && (
                <p className="mt-2 line-clamp-3 rounded bg-black/40 px-2 py-1.5 font-mono text-xs text-zinc-500 break-all" title={h.value}>
                  {h.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
