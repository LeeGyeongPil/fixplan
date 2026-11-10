# 보안 정책 / Security policy

보안 취약점을 발견하셨다면 **공개 이슈 대신** 이 레포의 **Security → Report a vulnerability**(비공개 취약점 신고)로 알려 주세요. 확인 후 답변드리고, 고친 버전을 릴리스하면서 함께 안내합니다.

If you find a security issue, please **do not open a public issue**. Use **Security → Report a vulnerability** in this repository to report it privately. We will reply after checking and announce the fix with a release.

fixplan 은 서버를 열지 않는 CLI 이고, lockfile 을 읽기만 하며 고치지 않습니다. live 모드에서는 공개 API(OSV·npm·PyPI·Packagist·CISA KEV·FIRST EPSS)에 패키지 이름과 CVE ID 만 보냅니다. / fixplan is a CLI that opens no ports and only reads lockfiles. In live mode it sends only package names and CVE IDs to public APIs (OSV, npm, PyPI, Packagist, CISA KEV, FIRST EPSS).

## Intentionally vulnerable fixtures / 의도적으로 취약한 입력

fixplan scans lockfiles, so some files in this repository pin known-vulnerable versions on purpose. The tests and the README output depend on those exact versions. The paths are never installed or shipped (`files` in package.json); `examples/clean/` shows the patched result.

- `examples/mixed-shop/api/composer.lock`: guzzlehttp/guzzle 7.4.0, guzzlehttp/promises 1.5.3
- `examples/mixed-shop/web/package-lock.json`: lodash 4.17.15, systeminformation 5.3.0, ms 2.1.3
- `examples/mixed-shop/worker/uv.lock`: jinja2 3.1.2, markupsafe 2.1.5
- `test/fixtures/lockfiles/uv/uv.lock`: Flask 3.0.0, werkzeug 3.0.1, pytest 8.0.0
- `test/fixtures/lockfiles/requirements/requirements.txt`: Jinja2 3.1.2, MarkupSafe 2.1.5, requests 2.31.0 (plus unpinned or synthetic entries)
- `test/fixtures/lockfiles/composer/composer.lock`: monolog/monolog 3.5.0, phpunit/phpunit 11.0.1, psr/log 3.0.0, symfony/deprecation-contracts v3.4.0
- `test/fixtures/lockfiles/npm-v1/` and `npm-v2/`: synthetic packages (a, b, c, d) used only for parser tests

Dependabot alerts for these paths are expected. Dismiss them with the reason "Vulnerable code is not actually used" and do not bump the versions.

`examples/mixed-shop/` 과 `test/fixtures/lockfiles/` 는 fixplan 이 스캔할 입력이라 알려진 취약 버전을 일부러 고정합니다(설치·배포되지 않음). 위 목록이 경로별 고정 버전입니다. 이 경로의 Dependabot 알림은 예상된 것이며 닫기 사유는 "Vulnerable code is not actually used" 입니다. 버전은 올리지 마세요.
