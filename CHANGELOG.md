# Changelog

## 0.2.0 — 2026-11-11

- `--ignore <id>` on `fixplan scan`: skip an advisory by OSV id or alias (GHSA, CVE, PYSEC). Repeatable or comma separated, case-insensitive, exact match only.
- A matched id removes the whole alias group (same id/aliases key as the de-duplication), and verdicts, minimal fix, priority, summary and `--fail-on` are computed from the remaining advisories.
- Reports: Markdown gets ` · ignored: N` on the summary line and an `## Ignored` section; JSON gets a top-level `ignored` array. Both appear only when `--ignore` is used, so output without it is unchanged byte for byte.
- An ignored advisory that only matters for candidate (fix) versions, so ignoring it can change the recommended version or `still_affected_by`, is listed too (`affects: "candidate-versions-only"` in JSON, a suffix in Markdown). The same id hitting several packages or lockfiles is excluded everywhere and listed once per package and lockfile.
- An id that matches no advisory in the scan is a warning (in the report's `## Warnings` / JSON `warnings`, not stderr), not an error. A malformed id exits 2.

## 0.1.2 — 2026-11-10

Documentation only; no code change.

- README: replaced the comparison table with a short "언제 쓰나" (when to use) section.

## 0.1.1 — 2026-11-10

Documentation and security notice only; no code change.

- `SECURITY.md` and README explain that `examples/mixed-shop/` and `test/fixtures/lockfiles/` pin known-vulnerable versions on purpose, list the pinned versions per path, and say to dismiss Dependabot alerts with "Vulnerable code is not actually used".

## 0.1.0 — 2026-11-10

First milestone (M1).

- `fixplan scan [path]` reads `composer.lock` (+`composer.json`), `package-lock.json` v2/v3, `uv.lock` and pinned `requirements.txt` at the path and one folder down.
- Per vulnerable package: verdict (`fixable-in-major`, `major-upgrade`, `runtime-blocked`, `no-patch`), minimal safe version that clears **every** advisory, the naive fix and what still affects it, the reason when the runtime blocks the fix, and a suggested command.
- Runtime checks: Packagist `require.php` (p2 minified expanded), npm `engines.node` (legacy shapes normalized, unparseable = unknown), PyPI per-file `requires_python` (yanked files skipped). Runtime from `--php/--node/--python` or estimated from manifests.
- Version grammars: Composer (own implementation), PEP 440 (`@renovatebot/pep440`), npm (`semver`).
- Priority: CISA KEV > EPSS > severity > ease. Advisories without a CVE have EPSS `unknown`.
- Markdown and JSON output, `--out`, `--fail-on kev,fixable,any` (exit 0/1, input errors 2).
- `--offline` practice mode replays a snapshot recorded 2026-11-10 (`snapshot/NOTICE.md`); live mode calls OSV, npm, PyPI, Packagist, KEV and EPSS directly.
- `--offline` reports packages the snapshot does not cover as `N package(s) NOT checked` (JSON: `packages_unchecked`) so a `0 vulnerable` is never read as safe.
- `--php/--node/--python` values are validated; `--out` into a missing folder gives a one-line error.
- Prebuilt `dist/` is committed and the build script is `compile`, so `npm install -g github:LeeGyeongPil/fixplan` works without a build step.
- Tooling: TypeScript 7.0.2 (`tsc` only for typecheck and `dist/`), tests run `.ts` directly with Node's type stripping.
