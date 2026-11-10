// AC-3: 최소 상향은 후보마다 그 패키지의 "모든" 알림을 다시 검사한다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planFix } from "../../src/plan/minimal-fix.ts";
import type { OsvRecord } from "../../src/types.ts";
import { schemeFor } from "../../src/versions/index.ts";
import { planFromSnapshot } from "../helpers.ts";

describe("minimal fix on the bundled snapshot (2026-11-10)", () => {
  it("lodash naive fix is still affected", async () => {
    // lodash 4.17.15 에 해당하는 알림 5건의 fixed 중 최댓값은 4.18.0(GHSA-r5fr-rjxr-66jc).
    // 그런데 4.18.0 은 GHSA-f23m-r3pf-42rh 의 범위 [4.17.23, 4.18.1) 안에 있다 → 실제 최소 안전 버전은 4.18.1.
    // (npm bulk advisory API 는 5건만 돌려주지만 advisory-database 원본에는 GHSA-f23m-r3pf-42rh 가 더 있다.)
    const plan = await planFromSnapshot("npm", "lodash", "4.17.15", "18.0.0");
    assert.ok(plan);
    assert.equal(plan.naive_fix, "4.18.0");
    assert.deepEqual(plan.still_affected_by, ["GHSA-f23m-r3pf-42rh"]);
    assert.equal(plan.minimal_fix, "4.18.1");
    assert.equal(plan.verdict, "fixable-in-major");
    assert.equal(plan.current.length, 5);
  });

  it("a single alert's fixed (4.17.21, the highest-EPSS alert) leaves two alerts open", async () => {
    const plan = await planFromSnapshot("npm", "lodash", "4.17.15", "18.0.0");
    const hit = plan!.current.find((c) => c.record.id === "GHSA-35jh-r3h4-6jhm")!;
    assert.equal(hit.fixed, "4.17.21");
    const at = await planFromSnapshot("npm", "lodash", "4.17.21", "18.0.0");
    assert.deepEqual(at!.current.map((c) => c.record.id).sort(), ["GHSA-r5fr-rjxr-66jc", "GHSA-xxjr-mmjv-4gpg"]);
  });

  it("guzzle 7.4.0 → 7.15.2 (GHSA-v5mv-p594-2x33 and GHSA-f7vp-7xgx-4w4r need 7.15.2; withdrawn alerts ignored)", async () => {
    const plan = await planFromSnapshot("Packagist", "guzzlehttp/guzzle", "7.4.0", "8.1");
    assert.equal(plan!.minimal_fix, "7.15.2");
    assert.equal(plan!.naive_fix, "7.15.2");
    assert.deepEqual(plan!.still_affected_by, []);
    assert.equal(plan!.current.length, 14);
    assert.ok(!plan!.current.some((c) => c.record.withdrawn));
  });

  it("systeminformation 5.3.0 → 5.33.16 (computed from all 12 alerts, not the KEV alert's 5.3.1)", async () => {
    const plan = await planFromSnapshot("npm", "systeminformation", "5.3.0", "18.0.0");
    assert.equal(plan!.minimal_fix, "5.33.16"); // GHSA-3f7j-7jwc-fxfj fixed 5.33.16
    assert.equal(plan!.current.length, 12);
    const kevAlert = plan!.current.find((c) => c.record.id === "GHSA-2m8v-572m-ff2v")!;
    assert.equal(kevAlert.fixed, "5.3.1");
  });

  it("returns null when no alert affects the version", async () => {
    assert.equal(await planFromSnapshot("npm", "lodash", "4.18.1", "18.0.0"), null);
  });
});

describe("verdicts on synthetic data", () => {
  const npm = schemeFor("npm");
  const rec = (id: string, events: object[]): OsvRecord =>
    ({ id, affected: [{ package: { ecosystem: "npm", name: "demo" }, ranges: [{ type: "ECOSYSTEM", events }] }] }) as OsvRecord;
  const registry = (vs: [string, string | null][]) => ({ versions: vs.map(([version, c]) => ({ version, runtimeConstraint: c })) });

  it("major-upgrade when every 1.x is affected", () => {
    const plan = planFix({
      scheme: npm,
      name: "demo",
      version: "1.0.0",
      advisories: [rec("A", [{ introduced: "0" }, { fixed: "2.0.0" }])],
      registry: registry([["1.0.0", null], ["1.5.0", null], ["2.0.0", null], ["2.1.0", null]]),
      runtimeVersion: "20.0.0",
    });
    assert.equal(plan!.verdict, "major-upgrade");
    assert.equal(plan!.minimal_fix, "2.0.0");
  });

  it("major-upgrade with a note when the same-major fix needs a newer runtime but the next major does not", () => {
    const plan = planFix({
      scheme: npm,
      name: "demo",
      version: "1.0.0",
      advisories: [rec("A", [{ introduced: "0" }, { fixed: "1.2.0" }])],
      registry: registry([["1.2.0", ">=22"], ["2.0.0", ">=18"]]),
      runtimeVersion: "20.0.0",
    });
    assert.equal(plan!.verdict, "major-upgrade");
    assert.equal(plan!.minimal_fix, "2.0.0");
    assert.match(plan!.notes.join("\n"), /same-major fix 1\.2\.0 requires node >=22/);
  });

  it("no-patch when nothing clears every alert, and says which alert remains", () => {
    const plan = planFix({
      scheme: npm,
      name: "demo",
      version: "1.0.0",
      advisories: [rec("OPEN", [{ introduced: "0" }]), rec("B", [{ introduced: "0" }, { fixed: "1.1.0" }])],
      registry: registry([["1.0.0", null], ["1.1.0", null]]),
      runtimeVersion: null,
    });
    assert.equal(plan!.verdict, "no-patch");
    assert.equal(plan!.minimal_fix, null);
    assert.match(plan!.blocked_reason!, /latest 1\.1\.0 is still affected by OPEN/);
  });

  it("prereleases are not candidates", () => {
    const plan = planFix({
      scheme: npm,
      name: "demo",
      version: "1.0.0",
      advisories: [rec("A", [{ introduced: "0" }, { fixed: "1.1.0-beta.1" }])],
      registry: registry([["1.1.0-beta.1", null], ["1.1.0", null]]),
      runtimeVersion: null,
    });
    assert.equal(plan!.minimal_fix, "1.1.0");
  });

  it("without registry data, falls back to the alerts' fixed versions and says so", () => {
    const plan = planFix({
      scheme: npm,
      name: "demo",
      version: "1.0.0",
      advisories: [rec("A", [{ introduced: "0" }, { fixed: "1.0.5" }]), rec("B", [{ introduced: "1.0.5" }, { fixed: "1.0.7" }])],
      registry: null,
      runtimeVersion: "20.0.0",
    });
    assert.equal(plan!.naive_fix, "1.0.5");
    assert.deepEqual(plan!.still_affected_by, ["B"]);
    assert.equal(plan!.minimal_fix, "1.0.7");
    assert.match(plan!.notes[0]!, /registry metadata unavailable/);
  });
});
