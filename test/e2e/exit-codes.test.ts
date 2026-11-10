// AC-10: --fail-on 종료 코드 — 1 = 조건 해당, 0 = 통과, 2 = 입력 오류(한 줄 메시지).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runCli } from "./run.ts";

describe("exit codes", () => {
  it("mixed-shop + --fail-on kev → 1", () => {
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline", "--fail-on", "kev"]).code, 1);
  });

  it("mixed-shop + --fail-on fixable → 1, without --fail-on → 0", () => {
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline", "--fail-on", "fixable"]).code, 1);
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline"]).code, 0);
  });

  it("examples/clean + --fail-on any → 0 with no findings", () => {
    const r = runCli(["scan", "examples/clean", "--offline", "--fail-on", "any", "--format", "json"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).findings.length, 0);
  });

  it("unknown --fail-on value → 2 and a one-line error", () => {
    const r = runCli(["scan", "examples/mixed-shop", "--offline", "--fail-on", "nope"]);
    assert.equal(r.code, 2);
    assert.equal(r.stderr, "fixplan: unknown --fail-on value 'nope' (use kev, fixable, any)\n");
    assert.equal(r.stdout, "");
  });

  it("missing path → 2 and a one-line error", () => {
    const r = runCli(["scan", "examples/does-not-exist", "--offline"]);
    assert.equal(r.code, 2);
    assert.equal(r.stderr.trim().split("\n").length, 1);
    assert.match(r.stderr, /path not found/);
  });

  it("unknown flag → 2", () => {
    const r = runCli(["scan", ".", "--offline", "--bogus"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^fixplan: Unknown option '--bogus'/);
  });

  it("--help and --version → 0", () => {
    assert.equal(runCli(["--help"]).code, 0);
    assert.match(runCli(["--version"]).stdout, /^\d+\.\d+\.\d+\n$/);
  });
});

describe("--out", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixplan-out-"));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("writes the report to a file and keeps stdout empty", () => {
    const file = join(dir, "report.json");
    const r = runCli(["scan", "examples/mixed-shop", "--offline", "--format", "json", "--out", file]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.ok(existsSync(file));
    assert.equal(JSON.parse(readFileSync(file, "utf8")).findings.length, 4);
  });

  it("--out into a missing folder → 2 and a one-line error, no stack trace", () => {
    const r = runCli(["scan", "examples/mixed-shop", "--offline", "--out", join(dir, "no-such-dir", "o.md")]);
    assert.equal(r.code, 2);
    assert.equal(r.stderr.trim().split("\n").length, 1);
    assert.match(r.stderr, /^fixplan: cannot write --out file .*ENOENT.*create the folder first/);
  });
});

describe("runtime flag validation", () => {
  it("--php abc → 2 with the expected format", () => {
    const r = runCli(["scan", "examples/mixed-shop", "--offline", "--php", "abc"]);
    assert.equal(r.code, 2);
    assert.equal(r.stderr, "fixplan: --php expects a version like 8.1 (got 'abc')\n");
  });

  it("--node and --python are validated too, valid values still work", () => {
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline", "--node", "x"]).code, 2);
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline", "--python", "3.x"]).code, 2);
    assert.equal(runCli(["scan", "examples/mixed-shop", "--offline", "--php", "8.1", "--node", "18", "--python", "3.10.2"]).code, 0);
  });
});

describe("packages the offline snapshot does not cover", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixplan-unchecked-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "requirements.txt"), "requests==2.0.0\n");

  it("markdown says NOT checked instead of looking safe", () => {
    const r = runCli(["scan", dir, "--offline"]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /1 package\(s\) NOT checked/);
    assert.doesNotMatch(r.stdout, /No known advisories affect the scanned versions/);
  });

  it("json carries packages_unchecked; fully covered scans report 0", () => {
    assert.equal(JSON.parse(runCli(["scan", dir, "--offline", "--format", "json"]).stdout).packages_unchecked, 1);
    assert.equal(JSON.parse(runCli(["scan", "examples/mixed-shop", "--offline", "--format", "json"]).stdout).packages_unchecked, 0);
  });
});
