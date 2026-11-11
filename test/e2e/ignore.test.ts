// --ignore <ID>: exact (case-insensitive) match by id or alias, group-wide exclusion,
// reports only change when the option is used, exit codes unchanged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FIXTURES, ROOT } from "../helpers.ts";
import { runCli } from "./run.ts";

const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;
const SYN = ["scan", "test/fixtures/ignore/project", "--offline", "--snapshot", "test/fixtures/ignore/snapshot"];
const MIXED = ["scan", "examples/mixed-shop", "--offline"];
const KEV_GHSA = "GHSA-2m8v-572m-ff2v";
const KEV_CVE = "CVE-2021-21315";

interface Doc {
  summary: Record<string, number>;
  findings: { name: string; minimal_fix: string | null; priority: number; advisories: { id: string }[] }[];
  warnings: string[];
  ignored?: { id: string; affects?: string; aliases: string[]; name: string; version: string; ecosystem: string; lockfile: string }[];
}
const json = (args: string[]) => {
  const r = runCli([...args, "--format", "json"]);
  return { ...r, doc: JSON.parse(r.stdout || "{}") as Doc };
};

describe("--ignore: output unchanged without the option", () => {
  for (const name of ["mixed-shop", "clean"]) {
    for (const ext of ["md", "json"]) {
      it(`examples/${name} ${ext} is byte-identical to the recorded baseline`, () => {
        const expected = readFileSync(join(FIXTURES, "baseline", `${name}.${ext}`), "utf8").replaceAll("@VERSION@", VERSION);
        const r = runCli(["scan", `examples/${name}`, "--offline", "--format", ext]);
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, expected);
      });
    }
  }

  it("json has no ignored key and md has no Ignored section", () => {
    assert.equal("ignored" in json(MIXED).doc, false);
    const md = runCli(MIXED).stdout;
    assert.doesNotMatch(md, /## Ignored|ignored:/);
  });
});

describe("--ignore: matching and exit codes (mixed-shop, KEV finding)", () => {
  const exit = (...extra: string[]) => runCli([...MIXED, "--fail-on", "kev", ...extra]).code;

  it("baseline --fail-on kev exits 1", () => assert.equal(exit(), 1));
  it("GHSA id excludes the KEV alert → 0", () => assert.equal(exit("--ignore", KEV_GHSA), 0));
  it("CVE alias excludes the same alert → 0", () => assert.equal(exit("--ignore", KEV_CVE), 0));
  it("lowercase id matches → 0", () => assert.equal(exit("--ignore", KEV_GHSA.toLowerCase()), 0));
  it("ignoring a different alert keeps exit 1", () => {
    const other = json(MIXED).doc.findings.flatMap((f) => f.advisories.map((a) => a.id)).find((id) => id !== KEV_GHSA)!;
    assert.equal(exit("--ignore", other), 1);
  });
  it("--ignore without --fail-on exits 0", () => {
    assert.equal(runCli([...MIXED, "--ignore", KEV_GHSA]).code, 0);
  });
  it("--fail-on any with remaining findings still exits 1", () => {
    assert.equal(runCli([...MIXED, "--fail-on", "any", "--ignore", KEV_GHSA]).code, 1);
  });

  it("json: ignored entry, summary and findings reflect the exclusion", () => {
    const base = json(MIXED).doc;
    const { doc } = json([...MIXED, "--ignore", KEV_CVE]);
    assert.equal(doc.ignored!.length, 1);
    assert.equal(doc.ignored![0]!.id, KEV_GHSA);
    assert.ok(doc.ignored![0]!.aliases.includes(KEV_CVE));
    assert.equal(doc.summary.kev, 0);
    assert.equal(doc.summary.kev, base.summary.kev! - 1);
    assert.equal(doc.warnings.length, base.warnings.length);
    assert.ok(!doc.findings.some((f) => f.advisories.some((a) => a.id === KEV_GHSA)));
  });

  it("md: summary suffix and Ignored section", () => {
    const md = runCli([...MIXED, "--ignore", KEV_GHSA]).stdout;
    assert.match(md, /in CISA KEV: 0 · ignored: 1\n/);
    assert.match(md, /\n## Ignored\n\n- ignored: GHSA-2m8v-572m-ff2v \(npm systeminformation [^,]+, [^)]+\)\n\nNotes:/);
  });
});

describe("--ignore: fixture with alias groups (demo-pkg has 3 records, solo-pkg 1)", () => {
  it("repeated and comma separated forms give the same output", () => {
    const a = runCli([...SYN, "--format", "json", "--ignore", "GHSA-aaaa-bbbb-cccc", "--ignore", "GHSA-gggg-hhhh-iiii"]);
    const b = runCli([...SYN, "--format", "json", "--ignore", "GHSA-aaaa-bbbb-cccc, GHSA-gggg-hhhh-iiii"]);
    assert.equal(a.code, 0, a.stderr);
    assert.equal(a.stdout, b.stdout);
  });

  it("ignoring every advisory of a package drops it from findings", () => {
    const { doc } = json([...SYN, "--ignore", "GHSA-gggg-hhhh-iiii"]);
    assert.deepEqual(doc.findings.map((f) => f.name), ["demo-pkg"]);
    assert.equal(doc.summary.vulnerable, 1);
    assert.deepEqual(doc.ignored!.map((i) => i.name), ["solo-pkg"]);
  });

  it("ignoring one of several advisories recomputes minimal fix, priority and KEV", () => {
    const base = json(SYN).doc.findings.find((f) => f.name === "demo-pkg")!;
    assert.equal(base.minimal_fix, "1.1.0");
    const { doc } = json([...SYN, "--ignore", "GHSA-dddd-eeee-ffff"]);
    const demo = doc.findings.find((f) => f.name === "demo-pkg")!;
    assert.equal(demo.minimal_fix, "1.0.1");
    assert.deepEqual(demo.advisories.map((a) => a.id), ["GHSA-aaaa-bbbb-cccc"]);
    assert.equal(doc.summary.kev, 0);
    assert.deepEqual(doc.findings.map((f) => f.priority), [1, 2]);
  });

  it("a PYSEC id excludes its alias group (PYSEC twin and GHSA record)", () => {
    const { doc, code } = json([...SYN, "--ignore", "PYSEC-2099-1"]);
    assert.equal(code, 0);
    assert.deepEqual(doc.findings.find((f) => f.name === "demo-pkg")!.advisories.map((a) => a.id), ["GHSA-dddd-eeee-ffff"]);
    assert.deepEqual(doc.ignored!.map((i) => i.id), ["GHSA-aaaa-bbbb-cccc"]);
    assert.deepEqual(doc.warnings, []);
  });

  it("ignored list is sorted by package then id", () => {
    const { doc } = json([...SYN, "--ignore", "GHSA-gggg-hhhh-iiii,CVE-2099-0002,CVE-2099-0001"]);
    assert.deepEqual(doc.ignored!.map((i) => i.id), ["GHSA-aaaa-bbbb-cccc", "GHSA-dddd-eeee-ffff", "GHSA-gggg-hhhh-iiii"]);
    assert.equal(doc.summary.vulnerable, 0);
  });

  it("a substring hides nothing and only warns", () => {
    const r = json([...SYN, "--fail-on", "any", "--ignore", "GHSA-aaaa"]);
    assert.equal(r.code, 1);
    assert.equal(r.doc.summary.vulnerable, 2);
    assert.deepEqual(r.doc.ignored, []);
    assert.deepEqual(r.doc.warnings, ["--ignore GHSA-aaaa: matched no advisory in this scan"]);
  });

  it("unknown id: warning line in md and json, exit code unchanged", () => {
    const md = runCli([...SYN, "--ignore", "CVE-1999-0000"]);
    assert.equal(md.code, 0);
    assert.match(md.stdout, /## Ignored\n\n- none \(see warnings\)\n/);
    assert.match(md.stdout, /## Warnings\n\n- --ignore CVE-1999-0000: matched no advisory in this scan\n$/);
    assert.match(md.stdout, / · ignored: 0\n/);
    assert.equal(runCli([...SYN, "--fail-on", "any", "--ignore", "CVE-1999-0000"]).code, 1);
  });

  it("only the unmatched id among several gets a warning", () => {
    const r = json([...SYN, "--ignore", "GHSA-gggg-hhhh-iiii,GHSA-zzzz-yyyy-xxxx"]);
    assert.deepEqual(r.doc.warnings, ["--ignore GHSA-zzzz-yyyy-xxxx: matched no advisory in this scan"]);
  });
});

describe("--ignore: invalid values exit 2 before scanning", () => {
  for (const bad of ["nope", "-x", "GHSA-", "a b-c", "123-456", ",", " "]) {
    it(`'${bad}' → one-line error`, () => {
      const r = runCli([...SYN, `--ignore=${bad}`]);
      assert.equal(r.code, 2);
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /^fixplan: invalid --ignore id '.*' \(e\.g\. GHSA-xxxx-xxxx-xxxx, CVE-2021-21315\)\n$/);
    });
  }

  it("--ignore without a value → 2", () => {
    assert.equal(runCli([...SYN, "--ignore"]).code, 2);
  });

  it("--help documents --ignore", () => {
    assert.match(runCli(["--help"]).stdout, /--ignore <id> +skip an advisory by ID or alias \(GHSA, CVE, PYSEC; repeatable or comma separated\)/);
  });
});

const MULTI = ["scan", "test/fixtures/ignore-multi/project", "--offline", "--snapshot", "test/fixtures/ignore-multi/snapshot"];

describe("--ignore: same advisory across packages and lockfiles", () => {
  it("one id excludes every package and lockfile it hits, ignored list sorted", () => {
    const base = json(MULTI).doc;
    assert.deepEqual(base.findings.map((f) => f.name).sort(), ["pkg-cand", "pkg-other", "pkg-shared", "pkg-shared"]);
    const { doc, code } = json([...MULTI, "--fail-on", "any", "--ignore", "CVE-2099-1001"]);
    assert.deepEqual(doc.findings.map((f) => f.name), ["pkg-cand"]);
    assert.equal(code, 1);
    assert.deepEqual(doc.ignored!.map((i) => [i.name, i.lockfile, i.id]), [
      ["pkg-other", "b/package-lock.json", "GHSA-shar-edaa-0001"],
      ["pkg-shared", "a/package-lock.json", "GHSA-shar-edaa-0001"],
      ["pkg-shared", "b/package-lock.json", "GHSA-shar-edaa-0001"],
    ]);
    assert.deepEqual(doc.warnings, []);
    assert.match(runCli([...MULTI, "--ignore", "CVE-2099-1001"]).stdout, / · ignored: 3\n/);
  });

  it("output is identical across repeated runs", () => {
    const a = runCli([...MULTI, "--format", "json", "--ignore", "CVE-2099-1001"]).stdout;
    for (let i = 0; i < 3; i++) assert.equal(runCli([...MULTI, "--format", "json", "--ignore", "CVE-2099-1001"]).stdout, a);
  });
});

describe("--ignore: advisory that only matches candidate versions", () => {
  const CAND = "GHSA-cand-0002-bbbb";
  const pkgCand = (d: Doc) => d.findings.find((f) => f.name === "pkg-cand")!;

  it("baseline: the candidate-only advisory pushes the minimal fix to 1.0.2", () => {
    assert.equal(pkgCand(json(MULTI).doc).minimal_fix, "1.0.2");
  });

  it("ignoring it lowers the minimal fix and is recorded, not warned about", () => {
    const { doc } = json([...MULTI, "--ignore", CAND]);
    assert.equal(pkgCand(doc).minimal_fix, "1.0.1");
    assert.deepEqual(doc.warnings, []);
    assert.deepEqual(doc.ignored, [
      { id: CAND, aliases: ["CVE-2099-2002"], ecosystem: "npm", name: "pkg-cand", version: "1.0.0", lockfile: "a/package-lock.json", affects: "candidate-versions-only" },
    ]);
  });

  it("md: counted in the summary and listed in the Ignored section, no warning", () => {
    const md = runCli([...MULTI, "--ignore", CAND]).stdout;
    assert.match(md, / · ignored: 1\n/);
    assert.match(md, /- ignored: GHSA-cand-0002-bbbb \(npm pkg-cand 1\.0\.0, a\/package-lock\.json\) — affects candidate versions only\n/);
    assert.doesNotMatch(md, /matched no advisory|## Warnings/);
  });

  it("an alias of the candidate-only advisory works too", () => {
    const { doc } = json([...MULTI, "--ignore", "cve-2099-2002"]);
    assert.equal(doc.ignored!.length, 1);
    assert.deepEqual(doc.warnings, []);
  });

  it("ignoring the current and the candidate-only advisory: only the effective one is listed, no warning", () => {
    const { doc } = json([...MULTI, "--ignore", `${CAND},GHSA-cand-0001-aaaa`]);
    assert.deepEqual(doc.ignored!.map((i) => [i.id, i.affects]), [["GHSA-cand-0001-aaaa", undefined]]);
    assert.deepEqual(doc.warnings, []);
    assert.ok(!doc.findings.some((f) => f.name === "pkg-cand"));
  });

  it("an id that matches nothing still warns", () => {
    const { doc } = json([...MULTI, "--ignore", "GHSA-zzzz-yyyy-xxxx"]);
    assert.deepEqual(doc.warnings, ["--ignore GHSA-zzzz-yyyy-xxxx: matched no advisory in this scan"]);
  });

  it("mixed-shop: ignoring lodash GHSA-f23m-r3pf-42rh (candidate-only) lowers minimal fix, no warning", () => {
    const base = json(MIXED).doc;
    const { doc } = json([...MIXED, "--ignore", "GHSA-r5fr-rjxr-66jc,GHSA-f23m-r3pf-42rh"]);
    assert.equal(base.findings.find((f) => f.name === "lodash")!.minimal_fix, "4.18.1");
    assert.equal(doc.findings.find((f) => f.name === "lodash")!.minimal_fix, "4.17.23");
    assert.deepEqual(doc.ignored!.map((i) => i.id).filter((id) => id.startsWith("GHSA-f23m") || id.startsWith("GHSA-r5fr")).sort(), ["GHSA-f23m-r3pf-42rh", "GHSA-r5fr-rjxr-66jc"]);
    assert.ok(!doc.warnings.some((w) => w.includes("matched no advisory")));
  });
});
