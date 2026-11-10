# Offline snapshot — sources, licenses and what was trimmed

`snapshot/2026-11-10/` is the data behind `fixplan scan --offline` (the practice mode).
It was recorded on **2026-11-10** from public sources and then **trimmed** to the
packages used by `examples/mixed-shop` and `examples/clean`.
It is **practice data, not current advisories** — new advisories published after that
date are not in it. Use live mode (no `--offline`) for real results.

오프라인 연습 모드가 읽는 데이터입니다. 2026-11-10 에 공개 출처에서 받은 실제 응답을
예제 레포가 쓰는 패키지만 남기고 잘라 담았습니다. 그 뒤에 나온 알림은 없습니다.

| File | Source (retrieved 2026-11-10) | License / terms |
|---|---|---|
| `osv/*.json` | Original OSV files from [github/advisory-database](https://github.com/github/advisory-database) (`advisories/github-reviewed/<yyyy>/<mm>/<id>/<id>.json` on raw.githubusercontent.com). The list of IDs per package came from `https://api.github.com/advisories?ecosystem=<eco>&affects=<name>`. Files are unmodified. | [CC-BY-4.0](https://github.com/github/advisory-database/blob/main/LICENSE.md) — © GitHub, Inc. and advisory contributors |
| `registry/npm/*.json` | `https://registry.npmjs.org/<name>` with `Accept: application/vnd.npm.install-v1+json`; only `versions[v].engines` and `deprecated` kept | public registry metadata (facts) |
| `registry/pypi/*.json` | `https://pypi.org/pypi/<name>/json`; only per-file `filename`, `packagetype`, `requires_python`, `yanked` kept | public registry metadata (facts) |
| `registry/packagist/guzzlehttp~guzzle.json` | Packagist p2 **minified** format (`"minified": "composer/2.0"`), versions 7.4.0–8.3.1 only, fields `name`, `version`, `version_normalized`, `require`. Assembled from each tag's `composer.json` in [guzzle/guzzle](https://github.com/guzzle/guzzle) (the data Packagist publishes) because repo.packagist.org was not reachable from the recording machine; `require.php` values were cross-checked against `https://repo.packagist.org/p2/guzzlehttp/guzzle.json` (8.x `^7.4 \|\| ^8.0`, 7.x `^7.2.5 \|\| ^8.0`). | guzzle/guzzle is MIT; metadata facts |
| `kev.json` | CISA Known Exploited Vulnerabilities catalog via the [cisagov/kev-data](https://github.com/cisagov/kev-data) mirror, catalogVersion 2026.11.09. Only entries whose CVE appears in `osv/` are kept; `count` is the size of the full catalog. | [CC0 1.0](https://github.com/cisagov/kev-data/blob/develop/LICENSE) |
| `epss.json` | EPSS scores by [FIRST](https://www.first.org/epss/) as reported in the `epss` field of `https://api.github.com/advisories`. | FIRST asks users to cite EPSS: *Jacobs, Romanosky, et al., "Exploit Prediction Scoring System", FIRST.org* — see https://www.first.org/epss/faq |

## Known gaps (on purpose)

- Only GitHub-reviewed advisories (GHSA IDs). Live OSV also returns e.g. `PYSEC-` records for PyPI; fixplan merges those by alias.
- Withdrawn advisories that the GitHub list returned for guzzle (`GHSA-mjrx-74jh-7xgw`, `GHSA-mqq9-gxg5-m58g`, `GHSA-3fvr-2jw6-crq4`, `GHSA-32rq-jhr7-m3hh`) are kept so the "withdrawn alerts are ignored" rule is exercised on real data.
- `GHSA-m6ch-gg5f-wxx3` (CVE-2016-5385, guzzle 4.x–6.x only) is missing: its OSV file path could not be resolved. It does not affect any guzzle 7.x/8.x version used here.
- The example lockfiles are fictional and trimmed (`examples/*`). They are not a real application.
