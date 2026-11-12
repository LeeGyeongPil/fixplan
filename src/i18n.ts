// Output language (English / Korean). All human-facing text lives in this one table.
// JSON reports, verdict names, ecosystem names and suggested commands are machine data and are never translated.

export type Lang = "en" | "ko";
export const LANGS: readonly Lang[] = ["en", "ko"];

type Env = Record<string, string | undefined>;

/** "ko", "ko_KR.UTF-8" -> ko. Anything else (empty, C, POSIX, en_US, unknown) -> en. */
function fromValue(value: string): Lang {
  return value.trim().toLowerCase().startsWith("ko") ? "ko" : "en";
}

/** Environment language: FIXPLAN_LANG > LC_ALL > LC_MESSAGES > LANG. The first non-empty one decides. */
export function envLang(env: Env): Lang {
  for (const key of ["FIXPLAN_LANG", "LC_ALL", "LC_MESSAGES", "LANG"]) {
    const v = env[key];
    if (v !== undefined && v.trim() !== "") return fromValue(v);
  }
  return "en";
}

/** --lang value (already validated as en|ko) > environment. */
export function detectLang(flag: string | undefined, env: Env): Lang {
  if (flag === "en" || flag === "ko") return flag;
  return envLang(env);
}

export interface Messages {
  // help
  help: string;
  // cli errors
  unknownCommand: (c: string) => string;
  missingCommand: string;
  unexpectedArgument: (a: string) => string;
  unknownFormat: (v: string) => string;
  unknownFailOn: (v: string) => string;
  failOnNeedsValue: string;
  invalidIgnore: (id: string) => string;
  runtimeValue: (flag: string, example: string, got: string) => string;
  cannotWriteOut: (file: string, why: string) => string;
  wroteFile: (file: string) => string;
  unknownLang: (v: string) => string;
  // parseArgs errors
  unknownOption: (name: string) => string;
  optionNeedsValue: (name: string) => string;
  optionTakesNoValue: (name: string) => string;
  // scan errors
  pathNotFound: (p: string) => string;
  noLockfile: (p: string) => string;
  cannotRead: (rel: string, why: string) => string;
  snapshotNotFound: (path: string) => string;
  // live source (errors and --verbose progress)
  networkError: (url: string, why: string) => string;
  httpStatus: (status: number, url: string) => string;
  osvQueryFallback: (name: string, why: string) => string;
  osvCount: (eco: string, name: string, n: number) => string;
  progressAdvisories: (eco: string, name: string) => string;
  // markdown
  title: (path: string) => string;
  offlineNote: (note: string) => string;
  offlineFallbackNote: (recorded: string) => string;
  liveNote: string;
  scanned: (lockfiles: number, packages: number, runtimes: string) => string;
  summary: (n: number) => string;
  inKev: string;
  ignoredCount: (n: number) => string;
  notChecked: (n: number) => string;
  noneChecked: string;
  noneScanned: string;
  tableHead: string;
  upgradeRuntimeFirst: string;
  yes: string;
  no: string;
  details: string;
  direct: string;
  transitive: string;
  verdict: string;
  minimalFix: string;
  runtime: string;
  runtimeUnknown: (name: string) => string;
  naiveStill: (fix: string, ids: string) => string;
  naiveClears: (fix: string) => string;
  why: string;
  note: string;
  command: string;
  advisories: (n: number) => string;
  noCve: string;
  fixedAt: (v: string | null) => string;
  ignoredHeading: string;
  ignoredNoneWarn: string;
  ignoredNoneNoEffect: string;
  ignoredItem: string;
  candidateOnly: string;
  notes: string;
  warnings: string;
}

const en: Messages = {
  help: `fixplan — turn vulnerability alerts into a fix plan (Composer · PyPI · npm)

Usage:
  fixplan scan [path=.] [options]
  fixplan --version | --help

Runtime (otherwise estimated from composer.json / package.json / pyproject.toml):
  --php <ver>        e.g. 8.1
  --node <ver>       e.g. 18
  --python <ver>     e.g. 3.10

Data:
  --offline          replay the bundled snapshot (practice data recorded 2026-11-10, no network)
  --snapshot <dir>   use another snapshot folder with --offline
  --osv-url <url>    OSV API base           (env FIXPLAN_OSV_URL,  default https://api.osv.dev)
  --kev-url <url>    CISA KEV JSON feed     (env FIXPLAN_KEV_URL)
  --epss-url <url>   EPSS API               (env FIXPLAN_EPSS_URL, default https://api.first.org/data/v1/epss)
  --verbose          progress lines on stderr

Output:
  --format md|json   default md
  --out <file>       write the report to a file instead of stdout
  --fail-on <list>   exit 1 if any finding matches: kev, fixable, any (comma separated)
  --ignore <id>      skip an advisory by ID or alias (GHSA, CVE, PYSEC; repeatable or comma separated)
  --lang en|ko       language of messages and the Markdown report (env FIXPLAN_LANG, then LC_ALL, LC_MESSAGES, LANG; default en). JSON is never translated

Exit codes: 0 ok · 1 --fail-on matched · 2 input or network error`,
  unknownCommand: (c) => `unknown command '${c}' (try: fixplan scan .)`,
  missingCommand: "missing command (try: fixplan scan .)",
  unexpectedArgument: (a) => `unexpected argument '${a}'`,
  unknownFormat: (v) => `unknown --format '${v}' (use md or json)`,
  unknownFailOn: (v) => `unknown --fail-on value '${v}' (use kev, fixable, any)`,
  failOnNeedsValue: "--fail-on needs a value (kev, fixable, any)",
  invalidIgnore: (id) => `invalid --ignore id '${id}' (e.g. GHSA-xxxx-xxxx-xxxx, CVE-2021-21315)`,
  runtimeValue: (flag, example, got) => `--${flag} expects a version like ${example} (got '${got}')`,
  cannotWriteOut: (file, why) => `cannot write --out file ${file}: ${why} (create the folder first)`,
  wroteFile: (file) => `wrote ${file}`,
  unknownLang: (v) => `unknown --lang '${v}' (use en or ko)`,
  unknownOption: (name) => `unknown option '${name}' (see fixplan --help)`,
  optionNeedsValue: (name) => `option '${name}' needs a value (see fixplan --help)`,
  optionTakesNoValue: (name) => `option '${name}' does not take a value (see fixplan --help)`,
  pathNotFound: (p) => `path not found or not a directory: ${p}`,
  noLockfile: (p) => `no supported lockfile (composer.lock, package-lock.json, uv.lock, requirements.txt) in ${p}`,
  cannotRead: (rel, why) => `cannot read ${rel}: ${why}`,
  snapshotNotFound: (path) => `snapshot not found: ${path}`,
  networkError: (url, why) => `network error: ${url} (${why})`,
  httpStatus: (status, url) => `HTTP ${status} from ${url}`,
  osvQueryFallback: (name, why) => `osv /v1/query failed for ${name} (${why}); trying /v1/querybatch`,
  osvCount: (eco, name, n) => `osv: ${eco}/${name} → ${n} advisories`,
  progressAdvisories: (eco, name) => `advisories: ${eco} ${name}`,
  title: (path) => `# fixplan report — ${path}`,
  offlineNote: (note) => `> **${note}.** Practice mode (bundled data). Run without \`--offline\` for live results.`,
  offlineFallbackNote: (recorded) => `offline snapshot recorded ${recorded}`,
  liveNote: "> live mode: data fetched from public APIs during this run.",
  scanned: (l, p, r) => `Scanned ${l} lockfile(s), ${p} package(s). Runtimes: ${r}`,
  summary: (n) => `**Summary: ${n} vulnerable package(s)**`,
  inKev: "in CISA KEV",
  ignoredCount: (n) => `ignored: ${n}`,
  notChecked: (n) =>
    `> **${n} package(s) NOT checked** (not covered by the offline snapshot). A "0 vulnerable" above does not cover them; run without \`--offline\`.`,
  noneChecked: "No known advisories affect the checked versions.",
  noneScanned: "No known advisories affect the scanned versions.",
  tableHead: "| # | Package | Current | Verdict | Minimal fix | Advisories | KEV | EPSS (max) | Command |",
  upgradeRuntimeFirst: "upgrade runtime first",
  yes: "yes",
  no: "no",
  details: "## Details",
  direct: "direct",
  transitive: "transitive",
  verdict: "verdict",
  minimalFix: "minimal fix",
  runtime: "runtime",
  runtimeUnknown: (name) => `${name} unknown — runtime not checked`,
  naiveStill: (fix, ids) => `naive fix ${fix} (highest "fixed" among current advisories) is **still affected** by ${ids}`,
  naiveClears: (fix) => `naive fix ${fix} (highest "fixed" among current advisories) clears every advisory`,
  why: "why",
  note: "note",
  command: "command",
  advisories: (n) => `advisories (${n})`,
  noCve: "no CVE",
  fixedAt: (v) => `fixed ${v ?? "none"}`,
  ignoredHeading: "## Ignored",
  ignoredNoneWarn: "- none (see warnings)",
  ignoredNoneNoEffect: "- none (no effect on the result)",
  ignoredItem: "ignored",
  candidateOnly: "affects candidate versions only",
  notes: "Notes: `no-patch` and EPSS `unknown` do not mean safe. Commands are suggestions — fixplan never edits lockfiles.",
  warnings: "## Warnings",
};

const ko: Messages = {
  help: `fixplan — 취약점 알림을 수정 계획으로 바꿉니다 (Composer · PyPI · npm)

사용법:
  fixplan scan [경로=.] [옵션]
  fixplan --version | --help

런타임 (생략하면 composer.json / package.json / pyproject.toml 에서 추정):
  --php <버전>       예: 8.1
  --node <버전>      예: 18
  --python <버전>    예: 3.10

데이터:
  --offline          동봉된 스냅샷으로 실행 (2026-11-10 에 기록한 연습용 데이터, 네트워크 없음)
  --snapshot <폴더>  --offline 과 함께 다른 스냅샷 폴더 사용
  --osv-url <url>    OSV API 주소           (환경변수 FIXPLAN_OSV_URL,  기본값 https://api.osv.dev)
  --kev-url <url>    CISA KEV JSON 주소     (환경변수 FIXPLAN_KEV_URL)
  --epss-url <url>   EPSS API 주소          (환경변수 FIXPLAN_EPSS_URL, 기본값 https://api.first.org/data/v1/epss)
  --verbose          진행 상황을 stderr 에 출력

출력:
  --format md|json   기본값 md
  --out <파일>       보고서를 stdout 대신 파일에 저장
  --fail-on <목록>   조건에 맞는 항목이 있으면 종료 코드 1: kev, fixable, any (쉼표로 구분)
  --ignore <id>      ID 나 별칭(GHSA, CVE, PYSEC)으로 알림 제외 (여러 번 또는 쉼표로 구분)
  --lang en|ko       메시지와 Markdown 보고서의 언어 (환경변수 FIXPLAN_LANG, 그다음 LC_ALL, LC_MESSAGES, LANG, 기본값 en). JSON 은 번역하지 않음

종료 코드: 0 정상 · 1 --fail-on 조건 해당 · 2 입력 또는 네트워크 오류`,
  unknownCommand: (c) => `알 수 없는 명령 '${c}' (예: fixplan scan .)`,
  missingCommand: "명령이 없습니다 (예: fixplan scan .)",
  unexpectedArgument: (a) => `예상하지 못한 인자 '${a}'`,
  unknownFormat: (v) => `알 수 없는 --format '${v}' (md 또는 json 만 쓸 수 있습니다)`,
  unknownFailOn: (v) => `알 수 없는 --fail-on 값 '${v}' (kev, fixable, any 중 하나여야 합니다)`,
  failOnNeedsValue: "--fail-on 에 값이 필요합니다 (kev, fixable, any)",
  invalidIgnore: (id) => `--ignore ID '${id}' 형식이 올바르지 않습니다 (예: GHSA-xxxx-xxxx-xxxx, CVE-2021-21315)`,
  runtimeValue: (flag, example, got) => `--${flag} 에는 ${example} 같은 버전이 필요합니다 (입력값 '${got}')`,
  cannotWriteOut: (file, why) => `--out 파일을 쓸 수 없습니다: ${file} (${why}). 폴더를 먼저 만들어야 합니다`,
  wroteFile: (file) => `${file} 에 저장했습니다`,
  unknownLang: (v) => `알 수 없는 --lang '${v}' (en 또는 ko 만 쓸 수 있습니다)`,
  unknownOption: (name) => `알 수 없는 옵션 '${name}' (fixplan --help 참고)`,
  optionNeedsValue: (name) => `옵션 '${name}' 에 값이 필요합니다 (fixplan --help 참고)`,
  optionTakesNoValue: (name) => `옵션 '${name}' 에는 값을 지정할 수 없습니다 (fixplan --help 참고)`,
  pathNotFound: (p) => `경로가 없거나 폴더가 아닙니다: ${p}`,
  noLockfile: (p) => `지원하는 잠금 파일(composer.lock, package-lock.json, uv.lock, requirements.txt)이 ${p} 에 없습니다`,
  cannotRead: (rel, why) => `읽을 수 없는 파일: ${rel} (${why})`,
  snapshotNotFound: (path) => `스냅샷을 찾을 수 없습니다: ${path}`,
  networkError: (url, why) => `네트워크 오류: ${url} (${why})`,
  httpStatus: (status, url) => `HTTP ${status} 응답: ${url}`,
  osvQueryFallback: (name, why) => `${name} 의 osv /v1/query 요청이 실패했습니다 (${why}). /v1/querybatch 로 다시 시도합니다`,
  osvCount: (eco, name, n) => `osv: ${eco}/${name} → 알림 ${n}건`,
  progressAdvisories: (eco, name) => `알림 조회: ${eco} ${name}`,
  title: (path) => `# fixplan 보고서 — ${path}`,
  offlineNote: (note) => `> **${note}.** 연습 모드(동봉 데이터)입니다. 실제 결과는 \`--offline\` 없이 실행해야 확인할 수 있습니다.`,
  offlineFallbackNote: (recorded) => `오프라인 스냅샷 기록일 ${recorded} — 연습용 데이터이며 현재 알림이 아님`,
  liveNote: "> 라이브 모드: 이번 실행 중 공개 API 에서 데이터를 가져왔습니다.",
  scanned: (l, p, r) => `잠금 파일 ${l}개, 패키지 ${p}개를 검사했습니다. 런타임: ${r}`,
  summary: (n) => `**요약: 취약 패키지 ${n}개**`,
  inKev: "CISA KEV 해당",
  ignoredCount: (n) => `제외: ${n}`,
  notChecked: (n) =>
    `> **확인하지 않은 패키지 ${n}개** (오프라인 스냅샷에 없음). 위의 "취약 0개"에는 이 패키지가 포함되지 않습니다. \`--offline\` 없이 실행해야 확인할 수 있습니다.`,
  noneChecked: "확인한 버전에 해당하는 알려진 알림이 없습니다.",
  noneScanned: "검사한 버전에 해당하는 알려진 알림이 없습니다.",
  tableHead: "| # | 패키지 | 현재 | 판정 | 최소 수정 | 알림 | KEV | EPSS (최대) | 명령 |",
  upgradeRuntimeFirst: "런타임 먼저 업그레이드",
  yes: "예",
  no: "아니오",
  details: "## 상세",
  direct: "직접 의존",
  transitive: "간접 의존",
  verdict: "판정",
  minimalFix: "최소 수정",
  runtime: "런타임",
  runtimeUnknown: (name) => `${name} 알 수 없음 — 런타임 미확인`,
  naiveStill: (fix, ids) => `단순 수정 ${fix} (현재 알림의 "fixed" 중 가장 높은 버전)은 ${ids} 에 **여전히 해당**`,
  naiveClears: (fix) => `단순 수정 ${fix} (현재 알림의 "fixed" 중 가장 높은 버전)이 모든 알림을 해결`,
  why: "사유",
  note: "참고",
  command: "명령",
  advisories: (n) => `알림 (${n})`,
  noCve: "CVE 없음",
  fixedAt: (v) => `수정 버전 ${v ?? "없음"}`,
  ignoredHeading: "## 제외됨",
  ignoredNoneWarn: "- 없음 (경고 참고)",
  ignoredNoneNoEffect: "- 없음 (결과에 영향 없음)",
  ignoredItem: "제외",
  candidateOnly: "후보 버전 판단에만 영향",
  notes: "참고: `no-patch` 와 EPSS `unknown` 은 안전하다는 뜻이 아닙니다. 명령은 제안일 뿐이며 fixplan 은 잠금 파일을 고치지 않습니다.",
  warnings: "## 경고",
};

export const MESSAGES: Record<Lang, Messages> = { en, ko };

export function messages(lang: Lang): Messages {
  return MESSAGES[lang];
}
