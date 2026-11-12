// Output language: key parity, precedence (--lang > FIXPLAN_LANG > LC_ALL > LC_MESSAGES > LANG),
// Korean messages for help / errors / Markdown, and JSON staying identical in every language.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { main } from "../src/cli.ts";
import { detectLang, MESSAGES } from "../src/i18n.ts";
import { LiveSource } from "../src/sources/live.ts";
import { messages } from "../src/i18n.ts";
import { scan } from "../src/scan.ts";
import { FixplanError } from "../src/sources/types.ts";
import { ROOT } from "./helpers.ts";

const SHOP = `${ROOT}/examples/mixed-shop`;

async function run(args: string[], env: Record<string, string | undefined> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await main(args, { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env });
  return { code, stdout, stderr };
}

describe("message table", () => {
  it("en and ko have exactly the same keys, with the same kind (text or function)", () => {
    assert.deepEqual(Object.keys(MESSAGES.ko).sort(), Object.keys(MESSAGES.en).sort());
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]) {
      assert.equal(typeof MESSAGES.ko[key], typeof MESSAGES.en[key], key);
    }
  });
});

describe("detectLang precedence", () => {
  it("--lang beats every environment variable", () => {
    assert.equal(detectLang("en", { FIXPLAN_LANG: "ko", LANG: "ko_KR.UTF-8" }), "en");
    assert.equal(detectLang("ko", { FIXPLAN_LANG: "en", LC_ALL: "en_US.UTF-8" }), "ko");
  });

  it("FIXPLAN_LANG > LC_ALL > LC_MESSAGES > LANG", () => {
    assert.equal(detectLang(undefined, { FIXPLAN_LANG: "ko", LC_ALL: "en_US", LC_MESSAGES: "en_US", LANG: "en_US" }), "ko");
    assert.equal(detectLang(undefined, { LC_ALL: "ko_KR.UTF-8", LC_MESSAGES: "en_US", LANG: "en_US" }), "ko");
    assert.equal(detectLang(undefined, { LC_ALL: "en_US", LC_MESSAGES: "ko_KR", LANG: "ko_KR" }), "en");
    assert.equal(detectLang(undefined, { LC_MESSAGES: "ko_KR.UTF-8", LANG: "en_US" }), "ko");
    assert.equal(detectLang(undefined, { LANG: "ko_KR.UTF-8" }), "ko");
  });

  it("empty values are skipped; C, POSIX, English and unknown values mean English", () => {
    assert.equal(detectLang(undefined, { FIXPLAN_LANG: "", LC_ALL: "", LANG: "ko_KR.UTF-8" }), "ko");
    for (const v of ["en_US.UTF-8", "C", "POSIX", "fr_FR", "xx"]) assert.equal(detectLang(undefined, { LANG: v }), "en", v);
    assert.equal(detectLang(undefined, {}), "en");
  });
});

describe("Korean output", () => {
  it("--lang ko prints the help in Korean, --lang en in English", async () => {
    const ko = await run(["--help", "--lang", "ko"]);
    assert.equal(ko.code, 0);
    assert.match(ko.stdout, /사용법:/);
    assert.match(ko.stdout, /--lang en\|ko/);
    assert.match(ko.stdout, /FIXPLAN_LANG/);
    const en = await run(["--help", "--lang", "en"], { LANG: "ko_KR.UTF-8" });
    assert.match(en.stdout, /^fixplan — turn vulnerability alerts/);
    assert.match(en.stdout, /FIXPLAN_LANG/);
  });

  it("the environment picks Korean when --lang is absent", async () => {
    const r = await run(["scan", "nope-dir", "--offline"], { LANG: "ko_KR.UTF-8" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^fixplan: 경로가 없거나 폴더가 아닙니다: nope-dir\n$/);
  });

  it("input errors keep exit code 2 and the 'fixplan:' prefix", async () => {
    const cases: [string[], RegExp][] = [
      [["scan", SHOP, "--format", "xml"], /^fixplan: 알 수 없는 --format 'xml'/],
      [["scan", SHOP, "--fail-on", "nope"], /^fixplan: 알 수 없는 --fail-on 값 'nope'/],
      [["scan", SHOP, "--ignore", "bad id"], /^fixplan: --ignore ID 'bad id'/],
      [["scan", SHOP, "--php", "x"], /^fixplan: --php 에는 8\.1 같은 버전이 필요합니다/],
      [["frob"], /^fixplan: 알 수 없는 명령 'frob'/],
      [[], /^fixplan: 명령이 없습니다/],
      [["scan", ".", "extra", "more"], /^fixplan: 예상하지 못한 인자 'extra'/],
    ];
    for (const [args, re] of cases) {
      const r = await run([...args, "--lang", "ko"]);
      assert.equal(r.code, 2, args.join(" "));
      assert.match(r.stderr, re, args.join(" "));
    }
  });

  it("parseArgs errors are localized, and English keeps Node's message", async () => {
    const unknown = await run(["scan", ".", "--bogus", "--lang", "ko"]);
    assert.equal(unknown.code, 2);
    assert.equal(unknown.stderr, "fixplan: 알 수 없는 옵션 '--bogus' (fixplan --help 참고)\n");
    const missing = await run(["scan", ".", "--lang", "ko", "--php"]);
    assert.equal(missing.stderr, "fixplan: 옵션 '--php' 에 값이 필요합니다 (fixplan --help 참고)\n");
    const noValue = await run(["scan", ".", "--offline=1", "--lang=ko"]);
    assert.equal(noValue.stderr, "fixplan: 옵션 '--offline' 에는 값을 지정할 수 없습니다 (fixplan --help 참고)\n");
    const en = await run(["scan", ".", "--bogus"], { LANG: "en_US.UTF-8" });
    assert.match(en.stderr, /^fixplan: Unknown option '--bogus'/);
  });

  it("a bad --lang value exits 2, with the message in the environment language", async () => {
    const en = await run(["scan", SHOP, "--lang", "fr"], { LANG: "en_US.UTF-8" });
    assert.equal(en.code, 2);
    assert.equal(en.stderr, "fixplan: unknown --lang 'fr' (use en or ko)\n");
    const ko = await run(["scan", SHOP, "--lang", "fr"], { FIXPLAN_LANG: "ko" });
    assert.equal(ko.code, 2);
    assert.equal(ko.stderr, "fixplan: 알 수 없는 --lang 'fr' (en 또는 ko 만 쓸 수 있습니다)\n");
  });

  it("the Markdown report has Korean headings while verdicts, commands and IDs are unchanged", async () => {
    const ko = await run(["scan", SHOP, "--offline", "--lang", "ko", "--ignore", "GHSA-f23m-r3pf-42rh"]);
    assert.equal(ko.code, 0, ko.stderr);
    for (const s of ["# fixplan 보고서", "오프라인 스냅샷 기록일 2026-11-10 — 연습용 데이터", "**요약: 취약 패키지", "| # | 패키지 | 현재 | 판정 |", "## 상세", "## 제외됨", "- 판정: **", "- 명령: `", "참고: `no-patch`"]) {
      assert.ok(ko.stdout.includes(s), s);
    }
    assert.ok(!ko.stdout.includes("## Details"));
    assert.ok(!ko.stdout.includes("offline snapshot recorded"));
    const en = await run(["scan", SHOP, "--offline", "--lang", "en", "--ignore", "GHSA-f23m-r3pf-42rh"]);
    assert.ok(en.stdout.includes("## Details"));
    // 판정값·명령 문자열은 두 언어에서 같다
    const commands = (s: string) => [...s.matchAll(/`((?:npm|composer|uv)[^`]*)`/g)].map((m) => m[1]);
    assert.deepEqual(commands(ko.stdout), commands(en.stdout));
  });

  it("a runtime-blocked row says so in Korean", async () => {
    const r = await run(["scan", SHOP, "--offline", "--python", "3.6", "--lang", "ko"]);
    assert.match(r.stdout, /\| PyPI jinja2 \| 3\.1\.2 \| runtime-blocked \| 3\.1\.6 \|.*런타임 먼저 업그레이드 \|/);
    assert.match(r.stdout, /- 사유: 3\.1\.6 requires python/);
  });

  it("--format json output is identical in English and Korean", async () => {
    const args = ["scan", SHOP, "--offline", "--format", "json"];
    const en = await run([...args, "--lang", "en"]);
    const ko = await run([...args, "--lang", "ko"]);
    const env = await run(args, { LANG: "ko_KR.UTF-8" });
    assert.equal(en.code, 0);
    assert.equal(ko.stdout, en.stdout);
    assert.equal(env.stdout, en.stdout);
  });

  it("the --out confirmation is localized", async () => {
    const r = await run(["scan", SHOP, "--offline", "--out", `${ROOT}/no-such-folder/x.md`, "--lang", "ko"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^fixplan: --out 파일을 쓸 수 없습니다: .* \(ENOENT\)\. 폴더를 먼저 만들어야 합니다\n$/);
  });

  it("a missing snapshot folder is reported in Korean with exit code 2", async () => {
    const r = await run(["scan", SHOP, "--offline", "--snapshot", `${ROOT}/no-such-snapshot`, "--lang", "ko"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^fixplan: 스냅샷을 찾을 수 없습니다: .*manifest\.json\n$/);
    const en = await run(["scan", SHOP, "--offline", "--snapshot", `${ROOT}/no-such-snapshot`, "--lang", "en"]);
    assert.match(en.stderr, /^fixplan: snapshot not found: /);
  });

  it("a network failure is reported in Korean with exit code 2", async () => {
    const failing = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const ko = messages("ko");
    await assert.rejects(
      scan({ path: SHOP, fetch: failing, lang: "ko", concurrency: 1 }),
      (e: unknown) => e instanceof FixplanError && /^네트워크 오류: .* \(fetch failed\)$/.test(e.message),
    );
    const src = new LiveSource({ fetch: failing, messages: ko });
    await assert.rejects(src.kev(), /네트워크 오류: .* \(fetch failed\)/);
    const en = new LiveSource({ fetch: failing });
    await assert.rejects(en.kev(), /network error: .* \(fetch failed\)/);
  });

  it("an HTTP error status and the --verbose progress lines are Korean", async () => {
    const bad = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const src = new LiveSource({ fetch: bad, messages: messages("ko") });
    await assert.rejects(src.kev(), /HTTP 503 응답: /);
    const lines: string[] = [];
    await scan({ path: SHOP, offline: true, lang: "ko", log: (l) => lines.push(l) });
    assert.ok(lines.some((l) => l.startsWith("알림 조회: npm ")), lines.join("\n"));
    assert.ok(!lines.some((l) => l.startsWith("advisories:")));
    const en: string[] = [];
    await scan({ path: SHOP, offline: true, log: (l) => en.push(l) });
    assert.ok(en.some((l) => l.startsWith("advisories: npm ")));
  });

  it("--verbose through the CLI prints the Korean progress label on stderr", async () => {
    const r = await run(["scan", SHOP, "--offline", "--verbose", "--lang", "ko"]);
    assert.match(r.stderr, /fixplan: 알림 조회: /);
  });
});
