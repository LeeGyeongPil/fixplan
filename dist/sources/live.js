import { npmToRegistry } from "./npm-registry.js";
import { packagistToRegistry } from "./packagist.js";
import { pypiToRegistry } from "./pypi.js";
import { FixplanError } from "./types.js";
export const DEFAULT_URLS = {
    osv: "https://api.osv.dev",
    npm: "https://registry.npmjs.org",
    pypi: "https://pypi.org",
    packagist: "https://repo.packagist.org",
    kev: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    epss: "https://api.first.org/data/v1/epss",
};
export const EPSS_BATCH = 100;
export class LiveSource {
    fetchFn;
    urls;
    timeoutMs;
    log;
    kevCache = null;
    constructor(opts = {}) {
        this.fetchFn = opts.fetch ?? globalThis.fetch;
        this.urls = { ...DEFAULT_URLS, ...stripUndefined(opts.urls ?? {}) };
        this.timeoutMs = opts.timeoutMs ?? 120_000;
        this.log = opts.log ?? (() => { });
    }
    describe() {
        return { mode: "live", sources: { ...this.urls } };
    }
    /** JSON 요청 한 번. 404 는 null, 그 밖의 실패는 FixplanError */
    async json(url, init = {}) {
        let res;
        try {
            res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
        }
        catch (e) {
            throw new FixplanError(`network error: ${url} (${e.message})`);
        }
        if (res.status === 404)
            return null;
        if (!res.ok)
            throw new FixplanError(`HTTP ${res.status} from ${url}`);
        return res.json();
    }
    post(url, body) {
        return this.json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    }
    async advisoriesFor(ecosystem, name) {
        const pkg = { ecosystem, name };
        try {
            return await this.osvQuery(pkg);
        }
        catch (e) {
            this.log(`osv /v1/query failed for ${name} (${e.message}); trying /v1/querybatch`);
            return this.osvQueryBatch(pkg);
        }
    }
    async osvQuery(pkg) {
        const out = [];
        let pageToken;
        do {
            const body = pageToken ? { package: pkg, page_token: pageToken } : { package: pkg };
            const res = (await this.post(`${this.urls.osv}/v1/query`, body));
            out.push(...(res?.vulns ?? []));
            pageToken = res?.next_page_token;
        } while (pageToken);
        this.log(`osv: ${pkg.ecosystem}/${pkg.name} → ${out.length} advisories`);
        return out;
    }
    async osvQueryBatch(pkg) {
        const ids = [];
        let pageToken;
        do {
            const query = pageToken ? { package: pkg, page_token: pageToken } : { package: pkg };
            const res = (await this.post(`${this.urls.osv}/v1/querybatch`, { queries: [query] }));
            const first = res?.results?.[0];
            ids.push(...(first?.vulns ?? []).map((v) => v.id));
            pageToken = first?.next_page_token;
        } while (pageToken);
        const out = [];
        for (const id of ids) {
            const rec = (await this.json(`${this.urls.osv}/v1/vulns/${encodeURIComponent(id)}`));
            if (rec)
                out.push(rec);
        }
        return out;
    }
    async registry(ecosystem, name) {
        if (ecosystem === "npm") {
            // 스코프 패키지는 "/" 를 %2f 로 인코딩한다(@scope%2fname)
            const doc = await this.json(`${this.urls.npm}/${name.replace("/", "%2f")}`, {
                headers: { accept: "application/vnd.npm.install-v1+json" },
            });
            return doc ? npmToRegistry(doc) : null;
        }
        if (ecosystem === "PyPI") {
            const doc = await this.json(`${this.urls.pypi}/pypi/${encodeURIComponent(name)}/json`);
            return doc ? pypiToRegistry(doc) : null;
        }
        const lower = name.toLowerCase();
        const doc = await this.json(`${this.urls.packagist}/p2/${lower}.json`);
        return doc ? packagistToRegistry(doc, lower) : null;
    }
    kev() {
        // KEV 파일은 1.8MB 쯤 된다. 한 번 실행에 한 번만 받는다
        this.kevCache ??= this.json(this.urls.kev).then((doc) => {
            const list = doc?.vulnerabilities ?? [];
            return new Set(list.map((v) => v.cveID));
        });
        return this.kevCache;
    }
    async epss(cves) {
        const out = new Map();
        const unique = [...new Set(cves)].sort();
        // EPSS API 는 기본 limit 100 → 100개씩 나눠 묻는다
        for (let i = 0; i < unique.length; i += EPSS_BATCH) {
            const chunk = unique.slice(i, i + EPSS_BATCH);
            const doc = (await this.json(`${this.urls.epss}?cve=${chunk.join(",")}&limit=${EPSS_BATCH}`));
            for (const d of doc?.data ?? [])
                out.set(d.cve, Number(d.epss));
        }
        return out;
    }
}
function stripUndefined(o) {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
