// live 데이터 소스: 공개 API 를 직접 부른다(키 불필요).
//  - OSV        POST {osv}/v1/query  {"package":{...}} → 패키지 전체 알림, next_page_token 이 있으면 반복
//               실패하면 POST /v1/querybatch(ID 만) + GET /v1/vulns/{id} 로 대신한다
//  - npm        GET  {npm}/<name>   Accept: application/vnd.npm.install-v1+json (corgi, engines 포함)
//  - PyPI       GET  {pypi}/pypi/<name>/json
//  - Packagist  GET  {packagist}/p2/<vendor>/<pkg>.json
//  - KEV        GET  {kev}  (CISA 피드 JSON)
//  - EPSS       GET  {epss}?cve=a,b,...  — 한 번에 100개까지
// fetch 는 주입할 수 있다(테스트는 가짜 fetch 로 요청 모양만 확인한다).
import type { Ecosystem, OsvRecord, RegistryInfo } from "../types.ts";
import { npmToRegistry } from "./npm-registry.ts";
import { packagistToRegistry } from "./packagist.ts";
import { pypiToRegistry } from "./pypi.ts";
import { FixplanError, type DataSource, type SourceDescription } from "./types.ts";

export const DEFAULT_URLS = {
  osv: "https://api.osv.dev",
  npm: "https://registry.npmjs.org",
  pypi: "https://pypi.org",
  packagist: "https://repo.packagist.org",
  kev: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  epss: "https://api.first.org/data/v1/epss",
};

export const EPSS_BATCH = 100;

export interface LiveOptions {
  fetch?: typeof fetch;
  urls?: Partial<typeof DEFAULT_URLS>;
  /** 요청 하나의 제한 시간. 공개 API 는 느릴 수 있어 넉넉히 둔다 */
  timeoutMs?: number;
  /** 진행 상황 한 줄 로그(--verbose) */
  log?: (line: string) => void;
}

export class LiveSource implements DataSource {
  private readonly fetchFn: typeof fetch;
  private readonly urls: typeof DEFAULT_URLS;
  private readonly timeoutMs: number;
  private readonly log: (line: string) => void;
  private kevCache: Promise<Set<string>> | null = null;

  constructor(opts: LiveOptions = {}) {
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.urls = { ...DEFAULT_URLS, ...stripUndefined(opts.urls ?? {}) };
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.log = opts.log ?? (() => {});
  }

  describe(): SourceDescription {
    return { mode: "live", sources: { ...this.urls } };
  }

  /** JSON 요청 한 번. 404 는 null, 그 밖의 실패는 FixplanError */
  private async json(url: string, init: RequestInit = {}): Promise<unknown | null> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      throw new FixplanError(`network error: ${url} (${(e as Error).message})`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new FixplanError(`HTTP ${res.status} from ${url}`);
    return res.json();
  }

  private post(url: string, body: unknown): Promise<unknown | null> {
    return this.json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async advisoriesFor(ecosystem: Ecosystem, name: string): Promise<OsvRecord[]> {
    const pkg = { ecosystem, name };
    try {
      return await this.osvQuery(pkg);
    } catch (e) {
      this.log(`osv /v1/query failed for ${name} (${(e as Error).message}); trying /v1/querybatch`);
      return this.osvQueryBatch(pkg);
    }
  }

  private async osvQuery(pkg: { ecosystem: string; name: string }): Promise<OsvRecord[]> {
    const out: OsvRecord[] = [];
    let pageToken: string | undefined;
    do {
      const body = pageToken ? { package: pkg, page_token: pageToken } : { package: pkg };
      const res = (await this.post(`${this.urls.osv}/v1/query`, body)) as { vulns?: OsvRecord[]; next_page_token?: string } | null;
      out.push(...(res?.vulns ?? []));
      pageToken = res?.next_page_token;
    } while (pageToken);
    this.log(`osv: ${pkg.ecosystem}/${pkg.name} → ${out.length} advisories`);
    return out;
  }

  private async osvQueryBatch(pkg: { ecosystem: string; name: string }): Promise<OsvRecord[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const query = pageToken ? { package: pkg, page_token: pageToken } : { package: pkg };
      const res = (await this.post(`${this.urls.osv}/v1/querybatch`, { queries: [query] })) as {
        results?: { vulns?: { id: string }[]; next_page_token?: string }[];
      } | null;
      const first = res?.results?.[0];
      ids.push(...(first?.vulns ?? []).map((v) => v.id));
      pageToken = first?.next_page_token;
    } while (pageToken);
    const out: OsvRecord[] = [];
    for (const id of ids) {
      const rec = (await this.json(`${this.urls.osv}/v1/vulns/${encodeURIComponent(id)}`)) as OsvRecord | null;
      if (rec) out.push(rec);
    }
    return out;
  }

  async registry(ecosystem: Ecosystem, name: string): Promise<RegistryInfo | null> {
    if (ecosystem === "npm") {
      // 스코프 패키지는 "/" 를 %2f 로 인코딩한다(@scope%2fname)
      const doc = await this.json(`${this.urls.npm}/${name.replace("/", "%2f")}`, {
        headers: { accept: "application/vnd.npm.install-v1+json" },
      });
      return doc ? npmToRegistry(doc as Parameters<typeof npmToRegistry>[0]) : null;
    }
    if (ecosystem === "PyPI") {
      const doc = await this.json(`${this.urls.pypi}/pypi/${encodeURIComponent(name)}/json`);
      return doc ? pypiToRegistry(doc as Parameters<typeof pypiToRegistry>[0]) : null;
    }
    const lower = name.toLowerCase();
    const doc = await this.json(`${this.urls.packagist}/p2/${lower}.json`);
    return doc ? packagistToRegistry(doc as Parameters<typeof packagistToRegistry>[0], lower) : null;
  }

  kev(): Promise<Set<string>> {
    // KEV 파일은 1.8MB 쯤 된다. 한 번 실행에 한 번만 받는다
    this.kevCache ??= this.json(this.urls.kev).then((doc) => {
      const list = (doc as { vulnerabilities?: { cveID: string }[] } | null)?.vulnerabilities ?? [];
      return new Set(list.map((v) => v.cveID));
    });
    return this.kevCache;
  }

  async epss(cves: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const unique = [...new Set(cves)].sort();
    // EPSS API 는 기본 limit 100 → 100개씩 나눠 묻는다
    for (let i = 0; i < unique.length; i += EPSS_BATCH) {
      const chunk = unique.slice(i, i + EPSS_BATCH);
      const doc = (await this.json(`${this.urls.epss}?cve=${chunk.join(",")}&limit=${EPSS_BATCH}`)) as {
        data?: { cve: string; epss: string | number }[];
      } | null;
      for (const d of doc?.data ?? []) out.set(d.cve, Number(d.epss));
    }
    return out;
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
