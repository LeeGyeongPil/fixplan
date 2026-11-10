// Composer 버전 문법을 VersionScheme 모양으로 감싼다.
import type { VersionScheme } from "./index.ts";
import { compareComposer, parseComposerVersion, satisfiesComposer, validComposer } from "./composer.ts";

export const composerScheme: VersionScheme = {
  ecosystem: "Packagist",
  runtimeName: "php",
  valid: validComposer,
  compare: compareComposer,
  isPrerelease(v) {
    const p = parseComposerVersion(v);
    return !p || (p.stability !== "stable" && p.stability !== "patch");
  },
  sameMajor(base, cand) {
    const a = parseComposerVersion(base);
    const b = parseComposerVersion(cand);
    if (!a || !b) return false;
    if (a.nums[0] !== b.nums[0]) return false;
    return a.nums[0] !== 0 || a.nums[1] === b.nums[1];
  },
  normalizeName: (name) => name.toLowerCase(),
  runtimeSatisfies(runtimeVersion, constraint) {
    try {
      return satisfiesComposer(runtimeVersion, constraint);
    } catch {
      return "unknown";
    }
  },
};
