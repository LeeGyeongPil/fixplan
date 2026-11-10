// AC-6: lockfile 파싱 — composer.lock(+composer.json), package-lock v2·v3, uv.lock, requirements.txt.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseComposerLock } from "../../src/lockfiles/composer.ts";
import { findLockfiles } from "../../src/lockfiles/detect.ts";
import { parseNpmLock } from "../../src/lockfiles/npm.ts";
import { parseRequirements } from "../../src/lockfiles/requirements.ts";
import { parseUvLock } from "../../src/lockfiles/uv.ts";
import type { Pkg } from "../../src/types.ts";
import { FIXTURES, ROOT } from "../helpers.ts";

const LF = join(FIXTURES, "lockfiles");
const brief = (ps: Pkg[]) => ps.map((p) => `${p.name}@${p.version}${p.direct ? " direct" : ""}`).sort();

describe("composer.lock", () => {
  it("reads packages and packages-dev; composer.json decides direct (case-insensitive); strips a leading v", () => {
    const { packages, warnings } = parseComposerLock(join(LF, "composer", "composer.lock"), "composer/composer.lock");
    assert.deepEqual(brief(packages), [
      "monolog/monolog@3.5.0 direct",
      "phpunit/phpunit@11.0.1 direct",
      "psr/log@3.0.0",
      "symfony/deprecation-contracts@3.4.0",
    ]);
    assert.ok(packages.every((p) => p.ecosystem === "Packagist" && p.lockfileKind === "composer.lock"));
    assert.deepEqual(warnings, []);
  });
});

describe("package-lock.json", () => {
  it("v2: nested node_modules, scoped packages, aliases, links; direct = top-level and listed in the root", () => {
    const { packages } = parseNpmLock(join(LF, "npm-v2", "package-lock.json"), "npm-v2/package-lock.json");
    assert.deepEqual(brief(packages), [
      "@scope/b@2.1.0 direct",
      "a@1.0.0 direct",
      "c@1.0.0", // a/node_modules/c 와 @scope/b/node_modules/c 는 같은 버전 → 한 번
      "c@2.0.0",
      "d@1.2.0 direct",
      "real-pkg@3.1.0 direct", // my-alias → npm:real-pkg
    ]);
  });

  it("v3: the example web project", () => {
    const { packages } = parseNpmLock(join(ROOT, "examples", "mixed-shop", "web", "package-lock.json"), "web/package-lock.json");
    assert.deepEqual(brief(packages), ["lodash@4.17.15 direct", "ms@2.1.3 direct", "systeminformation@5.3.0 direct"]);
  });

  it("v1 is reported as unsupported instead of silently returning nothing", () => {
    const { packages, warnings } = parseNpmLock(join(LF, "npm-v1", "package-lock.json"), "npm-v1/package-lock.json");
    assert.equal(packages.length, 0);
    assert.match(warnings[0]!, /lockfileVersion 1 .*not supported/);
  });
});

describe("uv.lock", () => {
  it("root package dependencies (incl. dev groups) are direct; names are PEP 503 normalized; the root itself is skipped", () => {
    const { packages, requiresPython } = parseUvLock(join(LF, "uv", "uv.lock"), "uv/uv.lock");
    assert.deepEqual(brief(packages), ["flask@3.0.0 direct", "pytest@8.0.0 direct", "werkzeug@3.0.1"]);
    assert.equal(requiresPython, ">=3.11");
  });
});

describe("requirements.txt", () => {
  it("== pins only, names normalized, unpinned lines warned", () => {
    const { packages, warnings } = parseRequirements(join(LF, "requirements", "requirements.txt"), "requirements.txt");
    assert.deepEqual(brief(packages), [
      "jinja2@3.1.2 direct",
      "markupsafe@2.1.5 direct",
      "requests@2.31.0 direct",
      "zope-interface@6.1 direct",
    ]);
    assert.ok(warnings.some((w) => /requirements\.txt:7: 'flask>=2\.0' is not pinned with ==; skipped/.test(w)));
    assert.ok(warnings.some((w) => /editable install/.test(w)));
  });
});

describe("lockfile discovery", () => {
  it("finds lockfiles at the root and one folder down", () => {
    const found = findLockfiles(join(ROOT, "examples", "mixed-shop"));
    assert.deepEqual(
      found.map((f) => `${f.rel} (${f.kind})`),
      ["api/composer.lock (composer.lock)", "web/package-lock.json (package-lock.json)", "worker/uv.lock (uv.lock)"],
    );
  });
});
