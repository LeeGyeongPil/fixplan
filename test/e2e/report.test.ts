// AC-9: 시작 명령(npm start)의 Markdown 보고서와 --python 3.6 변형.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJson, ROOT } from "../helpers.ts";
import { runCli } from "./run.ts";

describe("npm start (offline Markdown report)", () => {
  // npm start 와 같은 인자로 실행한다(스크립트가 바뀌면 이 테스트가 먼저 알려 준다)
  const start = readJson<{ scripts: { start: string } }>(ROOT, "package.json").scripts.start;
  it("start script is the offline scan of the example repo", () => {
    assert.equal(start, "node src/cli.ts scan examples/mixed-shop --offline");
  });
  const run = runCli(start.split(" ").slice(2));

  it("exits 0", () => assert.equal(run.code, 0, run.stderr));

  it("opens with the snapshot date and the not-current notice", () => {
    const head = run.stdout.split("\n").slice(0, 4).join("\n");
    assert.match(head, /offline snapshot recorded 2026-11-10/);
    assert.match(head, /not current advisories/);
  });

  it("has a summary line with verdict counts", () => {
    assert.match(run.stdout, /\*\*Summary: 4 vulnerable package\(s\)\*\* — fixable-in-major: 4 · major-upgrade: 0 · runtime-blocked: 0 · no-patch: 0 · in CISA KEV: 1/);
  });

  it("table rows carry verdict, minimal fix and the command", () => {
    assert.match(run.stdout, /\| 1 \| npm systeminformation \| 5\.3\.0 \| fixable-in-major \| 5\.33\.16 \|.*\| yes \|/);
    assert.ok(run.stdout.includes("`npm install lodash@4.18.1`"));
    assert.ok(run.stdout.includes('`uv add "jinja2>=3.1.6"`'));
    assert.ok(run.stdout.includes('`composer require "guzzlehttp/guzzle:^7.15.2"`'));
  });

  it("explains the lodash trap", () => {
    assert.match(run.stdout, /naive fix 4\.18\.0 .* is \*\*still affected\*\* by GHSA-f23m-r3pf-42rh/);
  });
});

describe("--python 3.6", () => {
  const run = runCli(["scan", "examples/mixed-shop", "--offline", "--python", "3.6"]);
  it("turns the jinja2 row into runtime-blocked with the reason", () => {
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /\| PyPI jinja2 \| 3\.1\.2 \| runtime-blocked \| 3\.1\.6 \|.*upgrade runtime first \|/);
    assert.match(run.stdout, /why: 3\.1\.6 requires python >=3\.7 \(current 3\.6\)/);
    assert.match(run.stdout, /runtime-blocked: 1/);
  });
});

describe("--php 7.2.0", () => {
  const run = runCli(["scan", "examples/mixed-shop", "--offline", "--php", "7.2.0"]);
  it("turns guzzle into runtime-blocked because of ^7.2.5", () => {
    assert.match(run.stdout, /\| Packagist guzzlehttp\/guzzle \| 7\.4\.0 \| runtime-blocked \|/);
    assert.match(run.stdout, /requires php \^7\.2\.5 \\?\|\\?\| \^8\.0 \(current 7\.2\.0\)/);
  });
});
