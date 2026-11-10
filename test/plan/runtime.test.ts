// AC-4: 런타임 판정 — PyPI requires_python, Packagist require.php, npm engines.node.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkRuntime, planFix } from "../../src/plan/minimal-fix.ts";
import { detectNode, detectPhp, detectPython, pythonLowerBound } from "../../src/runtime/detect.ts";
import type { OsvRecord } from "../../src/types.ts";
import { schemeFor } from "../../src/versions/index.ts";
import { normalizeEngines } from "../../src/versions/npm.ts";
import { planFromSnapshot, ROOT } from "../helpers.ts";

describe("runtime verdicts on the bundled snapshot", () => {
  it("jinja2 3.1.2 + Python 3.10 → fixable-in-major 3.1.6", async () => {
    const plan = await planFromSnapshot("PyPI", "jinja2", "3.1.2", "3.10");
    assert.equal(plan!.verdict, "fixable-in-major");
    assert.equal(plan!.minimal_fix, "3.1.6");
  });

  it("jinja2 3.1.2 + Python 3.6 → runtime-blocked (3.1.6 requires_python >=3.7)", async () => {
    const plan = await planFromSnapshot("PyPI", "jinja2", "3.1.2", "3.6");
    assert.equal(plan!.verdict, "runtime-blocked");
    assert.equal(plan!.minimal_fix, "3.1.6");
    assert.match(plan!.blocked_reason!, />=3\.7/);
    assert.match(plan!.blocked_reason!, /current 3\.6/);
  });

  it("guzzle 7.4.0 + PHP 8.1 → fixable-in-major", async () => {
    const plan = await planFromSnapshot("Packagist", "guzzlehttp/guzzle", "7.4.0", "8.1");
    assert.equal(plan!.verdict, "fixable-in-major");
  });

  it("guzzle 7.4.0 + PHP 7.2.0 → runtime-blocked (7.x needs ^7.2.5, 8.x needs ^7.4)", async () => {
    const plan = await planFromSnapshot("Packagist", "guzzlehttp/guzzle", "7.4.0", "7.2.0");
    assert.equal(plan!.verdict, "runtime-blocked");
    assert.match(plan!.blocked_reason!, /\^7\.2\.5/);
  });

  it("systeminformation 5.3.0 + Node 8 → runtime-blocked (5.33.16 engines >=10.0.0)", async () => {
    const plan = await planFromSnapshot("npm", "systeminformation", "5.3.0", "8");
    assert.equal(plan!.verdict, "runtime-blocked");
    assert.match(plan!.blocked_reason!, />=10\.0\.0/);
  });

  it("unknown runtime → no runtime check, still picks the minimal safe version", async () => {
    const plan = await planFromSnapshot("PyPI", "jinja2", "3.1.2", null);
    assert.equal(plan!.verdict, "fixable-in-major");
    assert.equal(plan!.minimal_fix, "3.1.6");
  });
});

describe("npm engines", () => {
  const npm = schemeFor("npm");
  const rec: OsvRecord = {
    id: "A",
    affected: [{ package: { ecosystem: "npm", name: "web-fw" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "5.1.0" }] }] }],
  };

  it("a candidate with engines '>= 18' is excluded on Node 16 and allowed on Node 18", () => {
    const input = {
      scheme: npm,
      name: "web-fw",
      version: "5.0.0",
      advisories: [rec],
      registry: { versions: [{ version: "5.1.0", runtimeConstraint: ">= 18" }] },
    };
    assert.equal(planFix({ ...input, runtimeVersion: "16.20.2" })!.verdict, "runtime-blocked");
    assert.equal(planFix({ ...input, runtimeVersion: "18" })!.verdict, "fixable-in-major");
  });

  it("unparseable engines are 'unknown' and do not block", () => {
    const plan = planFix({
      scheme: npm,
      name: "web-fw",
      version: "5.0.0",
      advisories: [rec],
      registry: { versions: [{ version: "5.1.0", runtimeConstraint: "latest stable please" }] },
      runtimeVersion: "16.0.0",
    });
    assert.equal(plan!.verdict, "fixable-in-major");
    assert.match(plan!.notes.join("\n"), /could not be interpreted; not treated as blocking/);
  });

  it("normalizes legacy engines shapes", () => {
    assert.equal(normalizeEngines({ node: ">= 18" }), ">= 18");
    assert.equal(normalizeEngines(">=0.10"), ">=0.10");
    assert.equal(normalizeEngines(["node >= 0.8.0"]), ">= 0.8.0");
    assert.equal(normalizeEngines(["npm >= 1"]), null);
    assert.equal(normalizeEngines(undefined), null);
  });
});

describe("PyPI files", () => {
  const pypi = schemeFor("PyPI");
  it("one usable file that fits the runtime is enough", () => {
    const rv = { version: "2.0", runtimeConstraint: ">=3.12 | >=3.8", fileConstraints: [">=3.12", ">=3.8"] };
    assert.deepEqual(checkRuntime(pypi, rv, "3.10"), { status: "ok" });
  });
  it("a file without requires_python has no constraint", () => {
    assert.deepEqual(checkRuntime(pypi, { version: "2.0", runtimeConstraint: ">=3.12", fileConstraints: [">=3.12", null] }, "3.6"), {
      status: "ok",
    });
  });
  it("blocked when every usable file needs a newer Python", () => {
    assert.equal(checkRuntime(pypi, { version: "2.0", runtimeConstraint: ">=3.12", fileConstraints: [">=3.12"] }, "3.10").status, "blocked");
  });
});

describe("runtime detection", () => {
  const shop = join(ROOT, "examples", "mixed-shop");
  const empty = mkdtempSync(join(tmpdir(), "fixplan-rt-"));
  after(() => rmSync(empty, { recursive: true, force: true }));

  it("estimates from manifests and says so", () => {
    assert.deepEqual(detectPhp(join(shop, "api"), {}), { name: "php", version: "8.1", source: "composer.json config.platform.php (estimated)", checked: true });
    assert.deepEqual(detectNode(join(shop, "web"), {}), { name: "node", version: "18.0.0", source: "package.json engines.node lower bound (estimated)", checked: true });
    assert.deepEqual(detectPython(join(shop, "worker"), {}), { name: "python", version: "3.10", source: "pyproject.toml requires-python lower bound (estimated)", checked: true });
  });

  it("flags win over manifests", () => {
    assert.equal(detectPython(join(shop, "worker"), { python: "3.6" }).source, "--python flag");
  });

  it("unknown when nothing says → checked:false", () => {
    const r = detectPhp(empty, {});
    assert.equal(r.version, null);
    assert.equal(r.checked, false);
  });

  it("python lower bound parsing", () => {
    assert.equal(pythonLowerBound(">=3.10,<4"), "3.10");
    assert.equal(pythonLowerBound("~=3.9"), "3.9");
    assert.equal(pythonLowerBound("<4"), null);
  });
});
