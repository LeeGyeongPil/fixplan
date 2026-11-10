// Packaging guard: `npm install -g github:...` must work without a build step.
// npm 11.20 leaves a broken global install for a git dependency when the package has a `prepare`
// or `build` script (it tries to build in a temporary clone), and devDependencies (tsc) are not
// installed there anyway. So dist/ is committed and the build script is named `compile`.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ROOT } from "./helpers.ts";

describe("packaging", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string>; bin: Record<string, string> };

  it("has no install-time or build-triggering scripts", () => {
    for (const name of ["prepare", "prepack", "build", "install", "postinstall"]) assert.equal(pkg.scripts[name], undefined, name);
  });

  it("ships the prebuilt CLI that bin points to", () => {
    assert.ok(existsSync(join(ROOT, pkg.bin.fixplan!)));
  });
});
