// AC-1: Composer 버전 비교기·제약 파서. Composer 문서(https://getcomposer.org/doc/articles/versions.md)의 예를 표로 옮겼다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareComposer, composerLowerBound, satisfiesComposer } from "../../src/versions/composer.ts";

describe("Composer version compare", () => {
  const cases: [string, string, number][] = [
    ["8.3.1", "8.3.1.0", 0], // 4자리 정규화
    ["v7.4.0", "7.4.0", 0], // v 접두
    ["8.0.0-RC1", "8.0.0", -1], // stability: RC < stable
    ["8.0.0-beta2", "8.0.0-RC1", -1],
    ["8.0.0-alpha1", "8.0.0-beta1", -1],
    ["8.0.0-dev", "8.0.0-alpha1", -1],
    ["7.15.2", "7.15.10", -1], // 숫자 비교(문자열 아님)
    ["7.16.0", "7.15.99", 1],
    ["1.0.0-p1", "1.0.0", 1], // patch 는 stable 보다 크다
  ];
  for (const [a, b, want] of cases) {
    it(`${a} vs ${b} → ${want}`, () => assert.equal(Math.sign(compareComposer(a, b)), want));
  }
});

describe("Composer constraints", () => {
  const cases: [string, string, boolean][] = [
    // OR: || 와 | 둘 다
    ["^7.4 || ^8.0", "8.1", true],
    ["^7.4 || ^8.0", "7.2.0", false],
    ["^7.4 || ^8.0", "7.4.33", true],
    ["^7.2.5 | ^8.0", "8.1", true],
    ["^7.2.5 | ^8.0", "7.2.0", false],
    ["^7.2.5 | ^8.0", "7.2.5", true],
    ["^7.2.5 || ^8.0", "9.0.0", false],
    // ~ : 마지막 자리 앞까지 고정
    ["~7.2.5", "7.2.5", true],
    ["~7.2.5", "7.2.99", true],
    ["~7.2.5", "7.3.0", false], // = >=7.2.5 <7.3
    ["~1.2", "1.9.9", true], // = >=1.2 <2.0
    ["~1.2", "2.0.0", false],
    // ^0.x : 마이너까지 고정
    ["^0.3", "0.3.9", true],
    ["^0.3", "0.4.0", false], // = <0.4
    ["^0.0.3", "0.0.4", false],
    // AND: 공백·쉼표
    [">=1.0 <1.1", "1.0.5", true],
    [">=1.0 <1.1", "1.1.0", false],
    [">=1.0,<1.1", "1.0.5", true],
    [">=1.0, <1.1", "1.1.0", false],
    [">= 7.2 < 8", "7.4.0", true], // 연산자 뒤 공백
    [">=1.0 <1.1 || >=1.2", "1.2.0", true],
    [">=1.0 <1.1 || >=1.2", "1.1.5", false],
    // 하이픈 범위
    ["1.0 - 2.0", "2.0.9", true], // = >=1.0.0 <2.1
    ["1.0 - 2.0", "2.1.0", false],
    ["1.0.0 - 2.1.0", "2.1.0", true], // 끝까지 적으면 <=
    ["1.0.0 - 2.1.0", "2.1.1", false],
    // 와일드카드·별
    ["*", "0.0.1", true],
    ["7.4.*", "7.4.12", true],
    ["7.4.*", "7.5.0", false],
    // stability 와 정확한 버전
    ["^8.0", "8.0.0-RC1", true], // ^ 의 하한은 -dev 포함
    ["<8.0", "8.0.0-RC1", false], // <8.0 은 8.0.0-dev 미만
    ["8.3.1", "8.3.1.0", true],
    ["!=8.3.1", "8.3.1", false],
    [">8.1", "8.1.0", false],
    ["<=8.1", "8.1.0", true],
  ];
  for (const [constraint, version, want] of cases) {
    it(`'${constraint}' on ${version} → ${want}`, () => assert.equal(satisfiesComposer(version, constraint), want));
  }

  // composer-semver 0.1.1 로 확인한 판정과 같아야 한다(2026-11-10 기준)
  it("matches the probe results of composer-semver", () => {
    const probe: [string, boolean, boolean][] = [
      ["^7.4 || ^8.0", true, false],
      [">=8.1", true, false],
      ["~7.2.5 || ^8.0", true, false],
      ["^7.2.5 | ^8.0", true, false],
    ];
    for (const [c, on81, on72] of probe) {
      assert.equal(satisfiesComposer("8.1.0", c), on81, `${c} on 8.1.0`);
      assert.equal(satisfiesComposer("7.2.0", c), on72, `${c} on 7.2.0`);
    }
  });

  it("throws on garbage instead of guessing", () => {
    assert.throws(() => satisfiesComposer("8.1", "^^nope"));
  });

  it("lower bound for runtime estimation", () => {
    assert.equal(composerLowerBound("^8.1"), "8.1");
    assert.equal(composerLowerBound(">=7.4 <9"), "7.4");
    assert.equal(composerLowerBound("^7.2.5 || ^8.0"), "7.2.5");
    assert.equal(composerLowerBound("<9"), null);
  });
});
