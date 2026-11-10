# 보안 정책 / Security policy

보안 취약점을 발견하셨다면 **공개 이슈 대신** 이 레포의 **Security → Report a vulnerability**(비공개 취약점 신고)로 알려 주세요. 확인 후 답변드리고, 고친 버전을 릴리스하면서 함께 안내합니다.

If you find a security issue, please **do not open a public issue**. Use **Security → Report a vulnerability** in this repository to report it privately. We will reply after checking and announce the fix with a release.

fixplan 은 서버를 열지 않는 CLI 이고, lockfile 을 읽기만 하며 고치지 않습니다. live 모드에서는 공개 API(OSV·npm·PyPI·Packagist·CISA KEV·FIRST EPSS)에 패키지 이름과 CVE ID 만 보냅니다. / fixplan is a CLI that opens no ports and only reads lockfiles. In live mode it sends only package names and CVE IDs to public APIs (OSV, npm, PyPI, Packagist, CISA KEV, FIRST EPSS).
