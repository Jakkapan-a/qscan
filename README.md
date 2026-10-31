<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo/qscan_dark.png">
    <img src="public/logo/qscan_light.png" alt="QScan" width="320">
  </picture>
</p>

<p align="center">
  <strong>TLS, certificate, post-quantum and HTTP security header scanner.</strong><br>
  Enter a domain and get a graded security report in seconds.<br>
  <a href="https://qscan.meklink.com"><strong>qscan.meklink.com</strong></a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black">
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-339933">
</p>

---

## Features

| Check | What QScan reports |
|---|---|
| **TLS protocols** | Which of TLS 1.0, 1.1, 1.2 and 1.3 the server accepts, with the cipher suite negotiated for each. Legacy versions are flagged as vulnerable. |
| **Post-quantum (ML-KEM)** | Whether the server negotiates hybrid ML-KEM key exchange (FIPS 203): `X25519MLKEM768`, `SecP256r1MLKEM768`, `SecP384r1MLKEM1024` and `MLKEM768`. |
| **Certificate** | Issuer, expiry date and days remaining, key algorithm and strength (e.g. `RSA 2048`, `ECDSA P-256`), chain trust, hostname match and SANs. |
| **HTTP security headers** | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options` (or CSP `frame-ancestors`) and `X-Content-Type-Options`, each rated **Protected / Weak / Missing** with an explanation. |
| **Security grade** | An overall grade from **A+** to **F** with a 0–100 score and a prioritised list of findings. |

Scans are shareable: the domain is kept in the URL (`/?s=example.com`), so a refresh or a shared link re-runs the same scan.

## Quick start

**Requirements:** Node.js **24 or newer**, linked against **OpenSSL 3.5+**, which is required to test ML-KEM groups. Check with:

```bash
node -p process.versions.openssl   # should print 3.5.x or newer
```

With an older OpenSSL everything else still works, but the post-quantum checks show as `UNTESTED`.

```bash
git clone https://github.com/Jakkapan-a/qscan.git
cd qscan
npm install
npm run dev
```

Open <http://localhost:3000> and enter a domain.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

No environment variables are required.

## How a scan works

1. **Validate and resolve.** The input is normalised to a bare hostname (scheme, path and port are stripped; IDNs become punycode) and resolved via DNS.
2. **SSRF guard.** If any resolved address is private, loopback, link-local (including cloud metadata `169.254.169.254`), CGNAT, multicast or reserved, the scan is refused. The same check runs inside the socket's DNS lookup for every HTTP redirect, which also blocks DNS rebinding.
3. **Baseline handshake.** One TLS connection to port 443 confirms HTTPS is reachable and captures the certificate.
4. **Parallel probes** (about 9 handshakes plus 1 HTTP request, 8 s timeout each):
   - one handshake per TLS version, with min = max = that version;
   - one TLS 1.3 handshake per ML-KEM group, offering **only** that group, so a completed handshake proves the server supports it;
   - a `GET /` that follows up to 5 redirects and reads the response headers.
5. **Grade.** Findings are scored and capped as described below.

Legacy protocol probes use OpenSSL security level 0 so that TLS 1.0/1.1 support can be *detected*. No application data is sent over those connections.

## Grading

The score starts at 100, penalties are subtracted, and hard caps apply regardless of score.

| Finding | Effect |
|---|---|
| Untrusted chain, hostname mismatch, expired certificate, or no TLS 1.2/1.3 | Grade capped at **F** |
| Weak certificate key (RSA < 2048, EC < 256 bits) | −30, capped at **C** |
| TLS 1.0 enabled / TLS 1.1 enabled | −15 / −10, capped at **B** |
| TLS 1.3 not supported | −10, capped at **A** |
| HSTS missing / weak (max-age < 180 days) | −15 / −5, capped at **A** unless HSTS is strong |
| CSP missing / weak (`unsafe-inline`, `unsafe-eval`, wildcards) | −10 / −5 |
| X-Frame-Options missing / weak | −5 / −3 |
| X-Content-Type-Options missing / weak | −5 / −3 |
| Certificate expires within 14 days | −10 |
| ML-KEM supported | +5 bonus |

| Grade | Score |
|---|---|
| **A+** | ≥ 95 (and no cap applies) |
| **A** | ≥ 85 |
| **B** | ≥ 70 |
| **C** | ≥ 50 |
| **F** | < 50 |

## API

The UI is a thin client over a single endpoint, which you can call directly.

```http
POST /api/scan
Content-Type: application/json

{ "domain": "example.com" }
```

A successful scan returns `200` with a `ScanResult` (see [`src/lib/scan/types.ts`](src/lib/scan/types.ts)):

```jsonc
{
  "domain": "example.com",
  "ip": "203.0.113.10",
  "grade": "A",
  "score": 90,
  "tls": { "negotiatedProtocol": "TLSv1.3", "versions": [/* ... */], "pqc": { "supported": true, "groups": [/* ... */] } },
  "certificate": { "issuerOrg": "Let's Encrypt", "daysRemaining": 61, "keyLabel": "ECDSA P-256", "trusted": true /* ... */ },
  "headers": { "finalUrl": "https://example.com/", "statusCode": 200, "items": [/* ... */] },
  "findings": [{ "severity": "warning", "message": "..." }]
}
```

Errors return `{ "error": string, "code": string }`:

| Status | `code` | Meaning |
|---|---|---|
| 400 | `INVALID_DOMAIN`, `BAD_REQUEST` | Input is not a valid domain or the body is not JSON |
| 400 | `BLOCKED_ADDRESS` | The domain resolves to a private or reserved address |
| 422 | `DNS_FAILED` | The domain does not resolve |
| 429 | `RATE_LIMITED` | More than 10 scans per minute from one client |
| 502 | `CONN_REFUSED`, `CONN_RESET`, `UNREACHABLE`, `HANDSHAKE_FAILED`, `NO_CERTIFICATE` | Port 443 is unavailable or the TLS handshake failed |
| 504 | `TIMEOUT` | The server did not respond in time |
| 500 | `INTERNAL` | Unexpected scanner error |

## Project structure

```text
src/
├─ app/
│  ├─ layout.tsx              Root layout, wraps the app in <ScanProvider>
│  ├─ page.tsx                Header, logo and <Content />
│  ├─ api/scan/route.ts       POST /api/scan with rate limiting
│  └─ _components/
│     ├─ provider.tsx         Scan state, runScan(), ?s= URL sync
│     ├─ content.tsx          Search form, loading and error states
│     ├─ scan-results.tsx     Dashboard cards
│     └─ badges.tsx           Status and grade badges
├─ components/layouts/main.tsx
└─ lib/
   ├─ utils.ts                cn() and formatting helpers
   └─ scan/                   Server-only scan engine
      ├─ index.ts             scanDomain() orchestrator
      ├─ tls-probe.ts         Protocol and ML-KEM handshakes
      ├─ certificate.ts       Certificate analysis
      ├─ headers.ts           Header fetch and evaluation
      ├─ grade.ts             Scoring model
      ├─ net-guard.ts         SSRF protection
      ├─ domain.ts            Input normalisation
      ├─ errors.ts            ScanError and error mapping
      └─ types.ts             Types shared with the UI
```

**Stack:** Next.js 16 (App Router, Cache Components, React Compiler), React 19, TypeScript, Tailwind CSS v4.

## Deployment notes

- The scanner needs **outbound TCP to port 443** and the Node.js runtime. It does not run on edge runtimes.
- `maxDuration` for the API route is 30 s. Make sure your platform allows it.
- The rate limiter is **in memory** and keys on `X-Forwarded-For`. That is fine for a single instance behind a trusted proxy. For multiple instances, or if clients can reach the app directly, replace it with a shared store such as Redis.
- Results reflect the network path from wherever QScan is hosted, and some servers answer scanners differently from browsers.

## Responsible use

QScan only performs normal TLS handshakes and a single `GET` request, the same traffic a browser generates when it opens a site. Even so, **only scan domains you own or are authorized to test**, and follow the laws that apply to you.

## License

[MIT](LICENSE) © 2026 Jakkapan-a
