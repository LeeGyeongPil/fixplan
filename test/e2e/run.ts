// e2e 도우미: 실제 CLI 를 별도 프로세스로 띄워 stdout·stderr·종료 코드를 받는다.
import { spawnSync } from "node:child_process";
import { ROOT } from "../helpers.ts";

export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[]): CliRun {
  const r = spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    // 오프라인 테스트가 혹시라도 네트워크를 쓰면 바로 실패하도록 프록시를 막힌 주소로 둔다
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9" },
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}
