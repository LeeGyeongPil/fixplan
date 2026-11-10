# Changelog

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
