export function commandFor(pkg, verdict, fix) {
    // 런타임부터 올려야 하거나 고친 버전이 없으면 바로 실행할 명령이 없다(이유는 blocked_reason 에)
    if (!fix || verdict === "runtime-blocked" || verdict === "no-patch")
        return null;
    switch (pkg.lockfileKind) {
        case "composer.lock":
            return pkg.direct
                ? `composer require "${pkg.name}:^${fix}"`
                : // 전이 의존성: 직접 의존성으로 올리지 않고 이번 업데이트에만 하한을 건다
                    `composer update ${pkg.name} --with "${pkg.name}:>=${fix}"`;
        case "package-lock.json":
            return pkg.direct
                ? `npm install ${pkg.name}@${fix}`
                : `add "overrides": {"${pkg.name}": "${fix}"} to package.json, then npm install`;
        case "uv.lock":
            return pkg.direct ? `uv add "${pkg.name}>=${fix}"` : `uv lock --upgrade-package "${pkg.name}==${fix}"`;
        case "requirements.txt":
            return `change "${pkg.name}==${pkg.version}" to "${pkg.name}==${fix}" in ${pkg.lockfile}`;
    }
}
