// AC-2: OSV 해당 판정 — 여러 affected·여러 range·last_affected·versions 목록·withdrawn.
// 실제 레코드는 동봉 스냅샷(github/advisory-database 원본, 2026-11-10)에서, 경계 사례는 synthetic 픽스처에서 읽는다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { affects, dedupeRecords } from "../../src/osv/affects.ts";
import type { OsvRecord } from "../../src/types.ts";
import { schemeFor } from "../../src/versions/index.ts";
import { FIXTURES, readJson, snapshotOsv } from "../helpers.ts";

const packagist = schemeFor("Packagist");
const pypi = schemeFor("PyPI");
const npm = schemeFor("npm");

describe("real records (snapshot)", () => {
  // GHSA-v5mv-p594-2x33: affected 두 개 — [0, 7.15.2) 와 [8.0.0, 8.0.1)
  const guzzle = snapshotOsv("GHSA-v5mv-p594-2x33");

  it("guzzle 7.4.0 is affected, branch fixed 7.15.2", () => {
    assert.deepEqual(affects(guzzle, packagist, "guzzlehttp/guzzle", "7.4.0"), { affected: true, fixed: "7.15.2" });
  });
  it("guzzle 7.15.2 is not affected", () => {
    assert.equal(affects(guzzle, packagist, "guzzlehttp/guzzle", "7.15.2").affected, false);
  });
  it("guzzle 8.0.0 is affected through the second affected entry (fixed 8.0.1)", () => {
    assert.deepEqual(affects(guzzle, packagist, "guzzlehttp/guzzle", "8.0.0"), { affected: true, fixed: "8.0.1" });
  });
  it("guzzle 8.0.1 is not affected", () => {
    assert.equal(affects(guzzle, packagist, "guzzlehttp/guzzle", "8.0.1").affected, false);
  });

  it("jinja2 3.1.2 is affected (OSV name 'Jinja2' matches after PEP 503 normalization), 3.1.6 is not", () => {
    const rec = snapshotOsv("GHSA-cpwx-vrp4-4pq7"); // Jinja2 [0, 3.1.6)
    assert.deepEqual(affects(rec, pypi, "jinja2", "3.1.2"), { affected: true, fixed: "3.1.6" });
    assert.equal(affects(rec, pypi, "jinja2", "3.1.6").affected, false);
  });

  it("lodash 4.18.0 falls inside [4.17.23, 4.18.1) of GHSA-f23m-r3pf-42rh even though the alert text says '= 4.17.23'", () => {
    const rec = snapshotOsv("GHSA-f23m-r3pf-42rh");
    assert.deepEqual(affects(rec, npm, "lodash", "4.18.0"), { affected: true, fixed: "4.18.1" });
    assert.equal(affects(rec, npm, "lodash", "4.17.15").affected, false);
    // 같은 레코드라도 패키지마다 범위가 다르다: lodash.unset 은 [0, 4.18.0)
    assert.equal(affects(rec, npm, "lodash.unset", "4.18.0").affected, false);
    assert.equal(affects(rec, npm, "lodash.merge", "4.17.23").affected, false, "packages not listed in the record never match");
  });

  it("withdrawn advisories never match", () => {
    const rec = snapshotOsv("GHSA-mjrx-74jh-7xgw"); // withdrawn 2026-08-04
    assert.ok(rec.withdrawn);
    assert.equal(affects(rec, packagist, "guzzlehttp/guzzle", "7.4.0").affected, false);
  });
});

describe("synthetic edge cases", () => {
  const records = readJson<OsvRecord[]>(FIXTURES, "synthetic-osv.json");
  const byId = (id: string) => records.find((r) => r.id === id)!;

  it("versions-only entries use exact match", () => {
    const rec = byId("SYNTH-VERSIONS-ONLY");
    assert.deepEqual(affects(rec, npm, "demo-pkg", "1.2.3"), { affected: true, fixed: null });
    assert.equal(affects(rec, npm, "demo-pkg", "1.2.5").affected, false);
  });

  it("last_affected closes the range inclusively and has no fixed", () => {
    const rec = byId("SYNTH-LAST-AFFECTED");
    assert.deepEqual(affects(rec, npm, "demo-pkg", "2.3.0"), { affected: true, fixed: null });
    assert.equal(affects(rec, npm, "demo-pkg", "2.3.1").affected, false);
    assert.equal(affects(rec, npm, "demo-pkg", "1.9.9").affected, false);
  });

  it("unordered events form separate branches; each hit reports its own branch fix", () => {
    const rec = byId("SYNTH-MULTI-RANGE");
    assert.deepEqual(affects(rec, npm, "demo-pkg", "3.0.1"), { affected: true, fixed: "3.0.2" });
    assert.equal(affects(rec, npm, "demo-pkg", "3.1.0").affected, false);
    assert.deepEqual(affects(rec, npm, "demo-pkg", "3.2.7"), { affected: true, fixed: "3.3.5" });
    assert.deepEqual(affects(rec, npm, "demo-pkg", "3.4.0"), { affected: true, fixed: "3.5.1" });
    assert.equal(affects(rec, npm, "demo-pkg", "3.5.1").affected, false);
  });

  it("ecosystem must match exactly (the PyPI entry does not apply to npm)", () => {
    const rec = byId("SYNTH-MULTI-RANGE");
    assert.equal(affects(rec, npm, "demo-pkg", "3.1.0").affected, false);
    assert.deepEqual(affects(rec, pypi, "demo-pkg", "3.1.0"), { affected: true, fixed: "9.9.9" });
  });

  it("GIT ranges are ignored for version checks", () => {
    assert.equal(affects(byId("SYNTH-GIT-ONLY"), npm, "demo-pkg", "1.0.0").affected, false);
  });

  it("dedupe keeps the GHSA record when a PYSEC record aliases it", () => {
    const ghsa: OsvRecord = { id: "GHSA-aaaa-bbbb-cccc", aliases: ["CVE-2024-0001"] };
    const pysec: OsvRecord = { id: "PYSEC-2024-1", aliases: ["CVE-2024-0001", "GHSA-aaaa-bbbb-cccc"] };
    const other: OsvRecord = { id: "PYSEC-2024-2", aliases: ["CVE-2024-0002"] };
    assert.deepEqual(dedupeRecords([pysec, other, ghsa]).map((r) => r.id), ["GHSA-aaaa-bbbb-cccc", "PYSEC-2024-2"]);
  });
});
