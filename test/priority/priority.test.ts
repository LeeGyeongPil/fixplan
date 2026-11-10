// AC-7: 우선순위 — CVE alias 로 KEV 매칭, CVE 없는 알림의 EPSS 는 unknown(0 아님), KEV > EPSS > severity.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advisoryView, rankFindings } from "../../src/priority.ts";
import { SnapshotSource } from "../../src/sources/snapshot.ts";
import type { AdvisoryView, Finding, OsvRecord } from "../../src/types.ts";
import { SNAPSHOT, snapshotOsv } from "../helpers.ts";

describe("KEV and EPSS matching", () => {
  it("systeminformation GHSA-2m8v-572m-ff2v → CVE-2021-21315 alias → KEV true (snapshot KEV excerpt)", async () => {
    const src = new SnapshotSource(SNAPSHOT);
    const kev = await src.kev();
    const rec = snapshotOsv("GHSA-2m8v-572m-ff2v");
    const epss = await src.epss(["CVE-2021-21315"]);
    const view = advisoryView(rec, "5.3.1", kev, epss);
    assert.equal(view.kev, true);
    assert.equal(typeof view.epss, "number");
    assert.ok((view.epss as number) > 0.5);
  });

  it("an advisory without a CVE alias has EPSS 'unknown', not 0", async () => {
    const src = new SnapshotSource(SNAPSHOT);
    const rec = snapshotOsv("GHSA-mjrx-74jh-7xgw"); // aliases: []
    assert.deepEqual(rec.aliases, []);
    const view = advisoryView(rec, null, await src.kev(), await src.epss([]));
    assert.equal(view.epss, "unknown");
    assert.notEqual(view.epss, 0);
    assert.equal(view.kev, false);
  });

  it("a CVE id used directly as the OSV id also counts", () => {
    const rec: OsvRecord = { id: "CVE-2021-21315", aliases: [] };
    assert.equal(advisoryView(rec, null, new Set(["CVE-2021-21315"]), new Map()).kev, true);
  });

  it("severity comes from database_specific.severity", () => {
    assert.equal(advisoryView(snapshotOsv("GHSA-gx6r-qc2v-3p3v"), null, new Set(), new Map()).severity, "CRITICAL");
  });
});

describe("ordering", () => {
  const adv = (over: Partial<AdvisoryView>): AdvisoryView => ({
    id: "X",
    aliases: [],
    summary: "",
    severity: "LOW",
    kev: false,
    epss: "unknown",
    fixed: null,
    ...over,
  });
  const finding = (name: string, advisories: AdvisoryView[], verdict: Finding["verdict"] = "fixable-in-major"): Omit<Finding, "priority"> => ({
    ecosystem: "npm",
    name,
    version: "1.0.0",
    direct: true,
    lockfile: "package-lock.json",
    advisories,
    verdict,
    minimal_fix: null,
    naive_fix: null,
    still_affected_by: [],
    runtime: { name: "node", version: null, source: "unknown", checked: false },
    blocked_reason: null,
    notes: [],
    command: null,
  });

  it("KEV > EPSS > severity > ease, then name", () => {
    const ranked = rankFindings([
      finding("sev-critical-no-epss", [adv({ severity: "CRITICAL" })]),
      finding("epss-high", [adv({ epss: 0.9, severity: "LOW" })]),
      finding("kev-low-epss", [adv({ kev: true, epss: 0.01, severity: "LOW" })]),
      finding("epss-low", [adv({ epss: 0.02, severity: "HIGH" })]),
      finding("sev-high-blocked", [adv({ severity: "HIGH" })], "runtime-blocked"),
      finding("sev-high-fixable", [adv({ severity: "HIGH" })]),
    ]);
    assert.deepEqual(
      ranked.map((f) => `${f.priority}:${f.name}`),
      ["1:kev-low-epss", "2:epss-high", "3:epss-low", "4:sev-critical-no-epss", "5:sev-high-fixable", "6:sev-high-blocked"],
    );
  });

  it("unknown EPSS ranks below any known score but is still reported as unknown", () => {
    const ranked = rankFindings([finding("unknown", [adv({ severity: "HIGH" })]), finding("tiny", [adv({ epss: 0.0001 })])]);
    assert.deepEqual(ranked.map((f) => f.name), ["tiny", "unknown"]);
    assert.equal(ranked[1]!.advisories[0]!.epss, "unknown");
  });
});
