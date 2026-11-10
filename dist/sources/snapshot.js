// 오프라인(연습용 목) 데이터 소스: 저장소에 든 스냅샷 폴더를 읽기만 한다. 네트워크 호출 0.
// 스냅샷은 2026-11-10 에 공개 API 에서 받은 실제 응답을 잘라 담은 것이다(snapshot/NOTICE.md).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { schemeFor } from "../versions/index.js";
import { normalizePypiName } from "../versions/pep440.js";
import { npmToRegistry } from "./npm-registry.js";
import { packagistToRegistry } from "./packagist.js";
import { pypiToRegistry } from "./pypi.js";
import { FixplanError } from "./types.js";
/** 레지스트리 파일 이름: "/" 는 "~" 로(guzzlehttp/guzzle → guzzlehttp~guzzle) */
export function registryFileName(ecosystem, name) {
    if (ecosystem === "PyPI")
        return normalizePypiName(name);
    return name.toLowerCase().replace("/", "~");
}
export class SnapshotSource {
    dir;
    manifest;
    constructor(dir) {
        const manifestPath = join(dir, "manifest.json");
        if (!existsSync(manifestPath))
            throw new FixplanError(`snapshot not found: ${manifestPath}`);
        this.dir = dir;
        this.manifest = this.readJson("manifest.json");
    }
    readJson(...parts) {
        return JSON.parse(readFileSync(join(this.dir, ...parts), "utf8"));
    }
    describe() {
        return { mode: "offline", recorded: this.manifest.recorded, note: this.manifest.note, sources: this.manifest.sources };
    }
    async advisoriesFor(ecosystem, name) {
        const scheme = schemeFor(ecosystem);
        const byName = this.manifest.packages[ecosystem] ?? {};
        const key = Object.keys(byName).find((k) => scheme.normalizeName(k) === scheme.normalizeName(name));
        if (key === undefined)
            return null; // 스냅샷이 다루지 않는 패키지
        return byName[key].map((id) => this.readJson("osv", `${id}.json`));
    }
    async registry(ecosystem, name) {
        const folder = { npm: "npm", PyPI: "pypi", Packagist: "packagist" }[ecosystem];
        const file = join(this.dir, "registry", folder, `${registryFileName(ecosystem, name)}.json`);
        if (!existsSync(file))
            return null;
        const doc = JSON.parse(readFileSync(file, "utf8"));
        if (ecosystem === "npm")
            return npmToRegistry(doc);
        if (ecosystem === "PyPI")
            return pypiToRegistry(doc);
        return packagistToRegistry(doc, name.toLowerCase());
    }
    async kev() {
        const doc = this.readJson("kev.json");
        return new Set(doc.vulnerabilities.map((v) => v.cveID));
    }
    async epss(cves) {
        const doc = this.readJson("epss.json");
        const wanted = new Set(cves);
        return new Map(doc.data.filter((d) => wanted.has(d.cve)).map((d) => [d.cve, Number(d.epss)]));
    }
}
