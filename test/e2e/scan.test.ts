// AC-8: 오프라인 전체 스캔 JSON — 런타임 추정, 4건 판정, KEV 가 맨 앞, 결정적 출력.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../src/types.ts";
import { runCli } from "./run.ts";

const ARGS = ["scan", "examples/mixed-shop", "--offline", "--format", "json"];

describe("offline scan of examples/mixed-shop (JSON)", () => {
  const first = runCli(ARGS);
  const doc = JSON.parse(first.stdout) as {
    mode: string;
    snapshot: { recorded: string; note: string };
    lockfiles: { path: string; runtime: Finding["runtime"] }[];
    findings: Finding[];
    summary: Record<string, number>;
  };
  const by = (name: string) => doc.findings.find((f) => f.name === name)!;

  it("exits 0", () => assert.equal(first.code, 0, first.stderr));

  it("marks the output as offline practice data from the 2026-11-10 snapshot", () => {
    assert.equal(doc.mode, "offline");
    assert.equal(doc.snapshot.recorded, "2026-11-10");
    assert.match(doc.snapshot.note, /practice data, not current advisories/);
  });

  it("estimates runtimes from the manifests and names the source", () => {
    const rt = Object.fromEntries(doc.lockfiles.map((l) => [l.runtime.name, l.runtime]));
    assert.equal(rt.php!.version, "8.1");
    assert.match(rt.php!.source, /composer\.json config\.platform\.php \(estimated\)/);
    assert.equal(rt.node!.version, "18.0.0");
    assert.match(rt.node!.source, /package\.json engines\.node/);
    assert.equal(rt.python!.version, "3.10");
    assert.match(rt.python!.source, /pyproject\.toml requires-python/);
  });

  it("judges exactly guzzle, lodash, jinja2, systeminformation", () => {
    assert.deepEqual(doc.findings.map((f) => f.name).sort(), ["guzzlehttp/guzzle", "jinja2", "lodash", "systeminformation"]);
  });

  it("puts the KEV finding (systeminformation, CVE-2021-21315) first", () => {
    assert.equal(doc.findings[0]!.name, "systeminformation");
    assert.equal(doc.findings[0]!.priority, 1);
    assert.ok(doc.findings[0]!.advisories.some((a) => a.kev && a.aliases.includes("CVE-2021-21315")));
  });

  it("minimal fixes come from re-checking every advisory", () => {
    // lodash: 4.18.0 은 GHSA-f23m-r3pf-42rh 에 여전히 해당 → 4.18.1 (npm bulk advisory API 만 보면 4.18.0 으로 보인다)
    assert.equal(by("lodash").minimal_fix, "4.18.1");
    assert.equal(by("lodash").naive_fix, "4.18.0");
    assert.deepEqual(by("lodash").still_affected_by, ["GHSA-f23m-r3pf-42rh"]);
    assert.equal(by("jinja2").minimal_fix, "3.1.6");
    assert.equal(by("guzzlehttp/guzzle").minimal_fix, "7.15.2");
    assert.equal(by("systeminformation").minimal_fix, "5.33.16");
    assert.ok(doc.findings.every((f) => f.verdict === "fixable-in-major" && f.runtime.checked));
  });

  it("is deterministic: a second run prints the same bytes", () => {
    const second = runCli(ARGS);
    assert.equal(second.stdout, first.stdout);
  });
});
