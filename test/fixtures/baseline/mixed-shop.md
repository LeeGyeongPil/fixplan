# fixplan report — examples/mixed-shop

> **offline snapshot recorded 2026-11-10 — practice data, not current advisories.** Practice mode (bundled data). Run without `--offline` for live results.

Scanned 3 lockfile(s), 7 package(s). Runtimes: php 8.1 (composer.json config.platform.php (estimated)) · node 18.0.0 (package.json engines.node lower bound (estimated)) · python 3.10 (pyproject.toml requires-python lower bound (estimated))

**Summary: 4 vulnerable package(s)** — fixable-in-major: 4 · major-upgrade: 0 · runtime-blocked: 0 · no-patch: 0 · in CISA KEV: 1

| # | Package | Current | Verdict | Minimal fix | Advisories | KEV | EPSS (max) | Command |
|---|---|---|---|---|---|---|---|---|
| 1 | npm systeminformation | 5.3.0 | fixable-in-major | 5.33.16 | 12 (CRITICAL) | yes | 90.67% | `npm install systeminformation@5.33.16` |
| 2 | npm lodash | 4.17.15 | fixable-in-major | 4.18.1 | 5 (HIGH) | no | 21.33% | `npm install lodash@4.18.1` |
| 3 | Packagist guzzlehttp/guzzle | 7.4.0 | fixable-in-major | 7.15.2 | 14 (HIGH) | no | 1.99% | `composer require "guzzlehttp/guzzle:^7.15.2"` |
| 4 | PyPI jinja2 | 3.1.2 | fixable-in-major | 3.1.6 | 5 (MODERATE) | no | 0.98% | `uv add "jinja2>=3.1.6"` |

## Details

### 1. systeminformation 5.3.0 (npm, direct, web/package-lock.json)

- verdict: **fixable-in-major** → minimal fix **5.33.16**
- runtime: node 18.0.0 — package.json engines.node lower bound (estimated)
- naive fix 5.33.16 (highest "fixed" among current advisories) clears every advisory
- command: `npm install systeminformation@5.33.16`
- advisories (12):
  - GHSA-2m8v-572m-ff2v (CVE-2021-21315, HIGH, **KEV**, EPSS 90.67%, fixed 5.3.1) Command Injection Vulnerability
  - GHSA-3f7j-7jwc-fxfj (CVE-2026-116576, HIGH, EPSS 0.14%, fixed 5.33.16) systeminformation vulnerable to Windows command injection in services() through Unicode quotation marks
  - GHSA-4vjg-vx72-qq4g (CVE-2026-116673, LOW, EPSS 0.13%, fixed 5.33.14) systeminformation has path traversal in Linux networkStats() that allows symlink-based file disclosure outside /sys/class/net
  - GHSA-5vv4-hvf7-2h46 (CVE-2026-26318, HIGH, EPSS 1.28%, fixed 5.31.0) Command Injection via Unsanitized `locate` Output in `versions()` — systeminformation
  - GHSA-5xpp-75jx-m839 (CVE-2026-50289, HIGH, EPSS 2.18%, fixed 5.31.7) systeminformation: OS command injection in networkInterfaces() via interfaces(5) source-directive path on Linux
  - GHSA-7648-jmwf-vw7j (CVE-2026-116674, MODERATE, EPSS 0.29%, fixed 5.33.13) systeminformation has prototype pollution in `networkStats()` via the interface name
  - GHSA-9c88-49p5-5ggf (CVE-2026-26280, HIGH, EPSS 1.37%, fixed 5.30.8) Systeminformation has a Command Injection via unsanitized interface parameter in wifi.js retry path
  - GHSA-cvv5-9h9w-qp2m (CVE-2024-56334, HIGH, EPSS 0.70%, fixed 5.23.7) Systeminformation has command injection vulnerability in getWindowsIEEE8021x (SSID)
  - GHSA-gx6r-qc2v-3p3v (CVE-2023-42810, CRITICAL, EPSS 2.22%, fixed 5.21.7) systeminformation SSID Command Injection Vulnerability
  - GHSA-hvx9-hwr7-wjj9 (CVE-2026-44724, HIGH, EPSS 0.92%, fixed 5.31.6) Systeminformation vulnerable to Linux command injection in networkInterfaces() via unsanitized NetworkManager connection profile name
  - GHSA-jff2-qjw8-5476 (CVE-2021-21388, HIGH, EPSS 1.85%, fixed 5.6.4) Command Injection Vulnerability in systeminformation
  - GHSA-wphj-fx3q-84ch (CVE-2025-68154, HIGH, EPSS 12.99%, fixed 5.27.14) systeminformation has a Command Injection vulnerability in fsSize() function on Windows

### 2. lodash 4.17.15 (npm, direct, web/package-lock.json)

- verdict: **fixable-in-major** → minimal fix **4.18.1**
- runtime: node 18.0.0 — package.json engines.node lower bound (estimated)
- naive fix 4.18.0 (highest "fixed" among current advisories) is **still affected** by GHSA-f23m-r3pf-42rh
- command: `npm install lodash@4.18.1`
- advisories (5):
  - GHSA-29mw-wpgm-hmr9 (CVE-2020-28500, MODERATE, EPSS 7.34%, fixed 4.17.21) Regular Expression Denial of Service (ReDoS) in lodash
  - GHSA-35jh-r3h4-6jhm (CVE-2021-23337, HIGH, EPSS 21.33%, fixed 4.17.21) Command Injection in lodash
  - GHSA-p6mc-m468-83gw (CVE-2020-8203, HIGH, EPSS 5.21%, fixed 4.17.19) Prototype Pollution in lodash
  - GHSA-r5fr-rjxr-66jc (CVE-2026-4800, HIGH, EPSS 2.81%, fixed 4.18.0) lodash vulnerable to Code Injection via `_.template` imports key names
  - GHSA-xxjr-mmjv-4gpg (CVE-2025-13465, MODERATE, EPSS 1.82%, fixed 4.17.23) Lodash has Prototype Pollution Vulnerability in `_.unset`, `_.omit`, and `_.pullAt` functions

### 3. guzzlehttp/guzzle 7.4.0 (Packagist, direct, api/composer.lock)

- verdict: **fixable-in-major** → minimal fix **7.15.2**
- runtime: php 8.1 — composer.json config.platform.php (estimated)
- naive fix 7.15.2 (highest "fixed" among current advisories) clears every advisory
- command: `composer require "guzzlehttp/guzzle:^7.15.2"`
- advisories (14):
  - GHSA-25mq-v84q-4j7r (CVE-2022-31090, HIGH, EPSS 1.92%, fixed 7.4.5) CURLOPT_HTTPAUTH option not cleared on change of origin
  - GHSA-94pj-82f3-465w (CVE-2026-67339, MODERATE, EPSS 0.37%, fixed 7.14.2) Guzzle: Proxy-Authorization headers can be sent to origin servers
  - GHSA-cwmx-hcrq-mhc3 (CVE-2022-29248, HIGH, EPSS 1.35%, fixed 7.4.3) Cross-domain cookie leakage in Guzzle
  - GHSA-cwxw-98qj-8qjx (CVE-2026-55767, MODERATE, EPSS 0.21%, fixed 7.12.1) guzzlehttp/guzzle: Dot-Only Cookie Domains Match All Hosts
  - GHSA-f283-ghqc-fg79 (CVE-2026-67353, MODERATE, EPSS 0.42%, fixed 7.15.1) Guzzle: Unbounded response cookies risk denial of service
  - GHSA-f2wf-25xc-69c9 (CVE-2022-31042, HIGH, EPSS 1.99%, fixed 7.4.4) Failure to strip the Cookie header on change in host or HTTP downgrade
  - GHSA-f7vp-7xgx-4w4r (CVE-2026-69245, MODERATE, EPSS 0.20%, fixed 7.15.2) Guzzle: Noncanonical cookie domain keeps subdomain scope
  - GHSA-g446-98w2-8p5w (CVE-2026-59883, MODERATE, EPSS 0.17%, fixed 7.12.3) Guzzle: Cookie Disclosure and Injection via IP-Address Domains
  - GHSA-h95v-h523-3mw8 (CVE-2026-67354, MODERATE, EPSS 0.37%, fixed 7.15.1) Guzzle: URI fragments disclosed in redirect Referer headers
  - GHSA-q559-8m2m-g699 (CVE-2022-31091, HIGH, EPSS 1.57%, fixed 7.4.5) Change in port should be considered a change in origin
  - GHSA-v5mv-p594-2x33 (CVE-2026-69246, HIGH, EPSS 0.37%, fixed 7.15.2) Guzzle: Noncanonical host can bypass host-based checks
  - GHSA-w248-ffj2-4v5q (CVE-2022-31043, HIGH, EPSS 1.99%, fixed 7.4.4) Fix failure to strip Authorization header on HTTP downgrade
  - GHSA-wm3w-8rrp-j577 (CVE-2026-67355, MODERATE, EPSS 0.37%, fixed 7.15.1) Guzzle: Host-only cookie scope is not preserved
  - GHSA-wpwq-4j6v-78m3 (CVE-2026-55568, MODERATE, EPSS 0.15%, fixed 7.12.1) guzzlehttp/guzzle: Silent HTTPS-Proxy Downgrade to Cleartext

### 4. jinja2 3.1.2 (PyPI, direct, worker/uv.lock)

- verdict: **fixable-in-major** → minimal fix **3.1.6**
- runtime: python 3.10 — pyproject.toml requires-python lower bound (estimated)
- naive fix 3.1.6 (highest "fixed" among current advisories) clears every advisory
- command: `uv add "jinja2>=3.1.6"`
- advisories (5):
  - GHSA-cpwx-vrp4-4pq7 (CVE-2025-27516, MODERATE, EPSS 0.51%, fixed 3.1.6) Jinja2 vulnerable to sandbox breakout through attr filter selecting format method
  - GHSA-gmj6-6f8f-6699 (CVE-2024-56201, MODERATE, EPSS 0.31%, fixed 3.1.5) Jinja has a sandbox breakout through malicious filenames
  - GHSA-h5c8-rqwp-cp95 (CVE-2024-22195, MODERATE, EPSS 0.89%, fixed 3.1.3) Jinja vulnerable to HTML attribute injection when passing user input as keys to xmlattr filter
  - GHSA-h75v-3vvj-5mfj (CVE-2024-34064, MODERATE, EPSS 0.98%, fixed 3.1.4) Jinja vulnerable to HTML attribute injection when passing user input as keys to xmlattr filter
  - GHSA-q2x7-8rv6-6q7h (CVE-2024-56326, MODERATE, EPSS 0.52%, fixed 3.1.5) Jinja has a sandbox breakout through indirect reference to format method

Notes: `no-patch` and EPSS `unknown` do not mean safe. Commands are suggestions — fixplan never edits lockfiles.
