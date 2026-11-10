// AC-5: 데이터 소스 — Packagist minified 펼치기, PyPI yanked, live 요청 모양(가짜 fetch), offline 은 네트워크 0.
import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scan } from "../../src/scan.ts";
import { EPSS_BATCH, LiveSource } from "../../src/sources/live.ts";
import { npmToRegistry } from "../../src/sources/npm-registry.ts";
import { expandMinified, packagistToRegistry } from "../../src/sources/packagist.ts";
import { pypiToRegistry } from "../../src/sources/pypi.ts";
import { SnapshotSource } from "../../src/sources/snapshot.ts";
import { FIXTURES, readJson, ROOT, SNAPSHOT } from "../helpers.ts";

describe("Packagist p2 minified", () => {
  const p2 = readJson<Parameters<typeof expandMinified>[0]>(FIXTURES, "synthetic-packagist-minified.json");

  it("omitted fields are inherited from the previous entry", () => {
    const list = expandMinified(p2, "acme/http");
    assert.deepEqual(list[1]!.require, { php: "^8.1", "psr/log": "^3.0" }); // 2.0.0 은 require 생략 = 2.1.0 상속
    assert.equal(list[1]!.name, "acme/http");
  });

  it('"__unset" removes a field from that entry onwards', () => {
    const list = expandMinified(p2, "acme/http");
    assert.equal(list[2]!.suggest, undefined); // 1.9.0 에서 suggest 삭제
    assert.equal(list[3]!.require, undefined); // 1.8.0 에서 require 삭제
  });

  it("runtime constraint per version comes from the expanded require.php", () => {
    const reg = packagistToRegistry(p2, "acme/http");
    assert.deepEqual(
      reg.versions.map((v) => [v.version, v.runtimeConstraint]),
      [
        ["2.1.0", "^8.1"],
        ["2.0.0", "^8.1"],
        ["1.9.0", "^7.4 || ^8.0"],
        ["1.8.0", null],
      ],
    );
  });

  it("real snapshot excerpt: guzzle 8.3.0 inherits require.php from 8.3.1", () => {
    const doc = readJson<Parameters<typeof expandMinified>[0]>(SNAPSHOT, "registry", "packagist", "guzzlehttp~guzzle.json");
    const raw = doc.packages!["guzzlehttp/guzzle"]!;
    assert.equal(raw[1]!.version, "8.3.0");
    assert.equal(raw[1]!.require, undefined, "minified entry omits require");
    const reg = packagistToRegistry(doc, "guzzlehttp/guzzle");
    assert.equal(reg.versions.find((v) => v.version === "8.3.0")!.runtimeConstraint, "^7.4 || ^8.0");
    assert.equal(reg.versions.find((v) => v.version === "7.15.2")!.runtimeConstraint, "^7.2.5 || ^8.0");
  });
});

describe("PyPI files", () => {
  const reg = pypiToRegistry(readJson(FIXTURES, "synthetic-pypi.json"));
  const v = (ver: string) => reg.versions.find((x) => x.version === ver)!;

  it("a release whose files are all yanked is excluded", () => assert.equal(v("1.0").excluded, "yanked"));
  it("yanked files are dropped; the remaining files decide", () => {
    assert.equal(v("1.1").excluded, undefined);
    assert.deepEqual(v("1.1").fileConstraints, [">=3.8"]);
  });
  it("null requires_python stays null (no constraint)", () => assert.deepEqual(v("1.2").fileConstraints, [null]));
  it("a release with no files is excluded", () => assert.equal(v("1.3").excluded, "no files uploaded"));
});

describe("npm corgi", () => {
  it("engines and deprecated", () => {
    const reg = npmToRegistry({ versions: { "1.0.0": { engines: { node: ">=18" } }, "1.0.1": { deprecated: "broken" }, "1.0.2": {} } });
    assert.deepEqual(reg.versions[0], { version: "1.0.0", runtimeConstraint: ">=18" });
    assert.match(reg.versions[1]!.excluded!, /deprecated/);
    assert.equal(reg.versions[2]!.runtimeConstraint, null);
  });
});

/** 가짜 fetch: 요청을 기록하고 미리 정한 응답을 순서대로 돌려준다 */
function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

describe("live adapter request shapes (fake fetch, no network)", () => {
  it("OSV /v1/query: package-only body, repeats with page_token", async () => {
    const { fn, calls } = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init.body));
      return body.page_token ? { body: { vulns: [{ id: "B" }] } } : { body: { vulns: [{ id: "A" }], next_page_token: "t1" } };
    });
    const src = new LiveSource({ fetch: fn });
    const recs = await src.advisoriesFor("npm", "lodash");
    assert.deepEqual(recs.map((r) => r.id), ["A", "B"]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.url, "https://api.osv.dev/v1/query");
    assert.equal(calls[0]!.init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { package: { ecosystem: "npm", name: "lodash" } });
    assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { package: { ecosystem: "npm", name: "lodash" }, page_token: "t1" });
  });

  it("falls back to /v1/querybatch + /v1/vulns/{id} when /v1/query fails, honoring a custom base URL", async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.endsWith("/v1/query")) return { status: 500, body: {} };
      if (url.endsWith("/v1/querybatch")) return { body: { results: [{ vulns: [{ id: "GHSA-x" }] }] } };
      return { body: { id: "GHSA-x", affected: [] } };
    });
    const src = new LiveSource({ fetch: fn, urls: { osv: "http://127.0.0.1:9" } });
    const recs = await src.advisoriesFor("Packagist", "guzzlehttp/guzzle");
    assert.deepEqual(recs.map((r) => r.id), ["GHSA-x"]);
    assert.deepEqual(
      calls.map((c) => c.url),
      ["http://127.0.0.1:9/v1/query", "http://127.0.0.1:9/v1/querybatch", "http://127.0.0.1:9/v1/vulns/GHSA-x"],
    );
    assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { queries: [{ package: { ecosystem: "Packagist", name: "guzzlehttp/guzzle" } }] });
  });

  it("npm registry uses the corgi Accept header and encodes scoped names", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { versions: {} } }));
    const src = new LiveSource({ fetch: fn });
    await src.registry("npm", "@scope/pkg");
    assert.equal(calls[0]!.url, "https://registry.npmjs.org/@scope%2fpkg");
    assert.equal((calls[0]!.init.headers as Record<string, string>).accept, "application/vnd.npm.install-v1+json");
  });

  it("PyPI and Packagist URLs", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { releases: {}, packages: {} } }));
    const src = new LiveSource({ fetch: fn });
    await src.registry("PyPI", "jinja2");
    await src.registry("Packagist", "GuzzleHttp/Guzzle");
    assert.deepEqual(
      calls.map((c) => c.url),
      ["https://pypi.org/pypi/jinja2/json", "https://repo.packagist.org/p2/guzzlehttp/guzzle.json"],
    );
  });

  it(`EPSS is requested in batches of at most ${EPSS_BATCH} CVEs`, async () => {
    const { fn, calls } = fakeFetch((url) => {
      const cves = new URL(url).searchParams.get("cve")!.split(",");
      return { body: { data: cves.map((cve) => ({ cve, epss: "0.5" })) } };
    });
    const src = new LiveSource({ fetch: fn });
    const cves = Array.from({ length: 250 }, (_, i) => `CVE-2026-${String(10000 + i)}`);
    const scores = await src.epss(cves);
    assert.equal(calls.length, 3);
    for (const c of calls) {
      const u = new URL(c.url);
      assert.equal(`${u.origin}${u.pathname}`, "https://api.first.org/data/v1/epss");
      assert.ok(u.searchParams.get("cve")!.split(",").length <= EPSS_BATCH);
    }
    assert.equal(scores.size, 250);
    assert.equal(scores.get("CVE-2026-10000"), 0.5);
  });

  it("KEV feed is downloaded once per run", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { vulnerabilities: [{ cveID: "CVE-2021-21315" }] } }));
    const src = new LiveSource({ fetch: fn, urls: { kev: "https://example.test/kev.json" } });
    assert.ok((await src.kev()).has("CVE-2021-21315"));
    await src.kev();
    assert.equal(calls.length, 1);
  });

  it("HTTP errors become a one-line FixplanError", async () => {
    const { fn } = fakeFetch(() => ({ status: 503, body: {} }));
    const src = new LiveSource({ fetch: fn });
    await assert.rejects(src.registry("PyPI", "jinja2"), /HTTP 503 from https:\/\/pypi\.org\/pypi\/jinja2\/json/);
  });
});

describe("--offline never touches the network", () => {
  const realFetch = globalThis.fetch;
  let globalCalls = 0;
  beforeEach(() => {
    globalCalls = 0;
    globalThis.fetch = (async () => {
      globalCalls++;
      throw new Error("network used in offline mode");
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("a full offline scan makes zero fetch calls (injected and global)", async () => {
    const { fn, calls } = fakeFetch(() => ({ body: {} }));
    const result = await scan({ path: join(ROOT, "examples", "mixed-shop"), offline: true, fetch: fn });
    assert.equal(result.findings.length, 4);
    assert.equal(calls.length, 0);
    assert.equal(globalCalls, 0);
  });

  it("snapshot source reports packages it does not cover as null (not as clean)", async () => {
    const src = new SnapshotSource(SNAPSHOT);
    assert.equal(await src.advisoriesFor("npm", "left-pad"), null);
    assert.deepEqual(await src.advisoriesFor("PyPI", "MarkupSafe"), []);
  });
});
