// composer.lock 읽기. 직접 의존성 여부는 옆의 composer.json require·require-dev 로 정한다.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
export function parseComposerLock(lockPath, rel) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const warnings = [];
    // composer.json 이 있으면 require·require-dev 에 적힌 이름이 직접 의존성
    const manifestPath = join(dirname(lockPath), "composer.json");
    const direct = new Set();
    if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        for (const name of [...Object.keys(manifest.require ?? {}), ...Object.keys(manifest["require-dev"] ?? {})]) {
            direct.add(name.toLowerCase());
        }
    }
    else {
        warnings.push(`${rel}: composer.json not found next to it; all packages treated as transitive`);
    }
    const packages = [...(lock.packages ?? []), ...(lock["packages-dev"] ?? [])].map((p) => ({
        ecosystem: "Packagist",
        name: p.name,
        // composer.lock 은 "v1.2.3" 처럼 v 를 붙이기도 한다. OSV·Packagist 비교는 v 없는 형태가 기준
        version: p.version.replace(/^v(?=\d)/, ""),
        direct: direct.has(p.name.toLowerCase()),
        lockfile: rel,
        lockfileKind: "composer.lock",
    }));
    return { packages, warnings };
}
