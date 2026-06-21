#!/usr/bin/env bun

// alpha_cn (talkto.bio) 后端部署：SSH 进境内服务器 → 全子仓拉 dev → 重启 → 内部探活。
// 与 global server_deploy 解耦：host=cn、单服务、sudo、本地 docker 库。mysqldef 增量见 T3。

import { appendFileSync } from "fs"
import { ssh } from "../lib.js"

const HOST = "cn",
  APP = "/home/talktome/site/talkto.me/alpha",
  SERVICE = "talkto-bio-alpha",
  PORT = 3000,
  SUBS = [".", "srv", "conf", "lib", "ai", "site", "docker", "site/vibe", "site/static"],
  PROBE_TRIES = Number(process.env.HTTP_PROBE_RETRIES || 10),
  PROBE_INTERVAL_S = Number(process.env.HTTP_PROBE_INTERVAL_S || 3),
  RESTART_GRACE_MS = Number(process.env.RESTART_GRACE_MS || 6000),
  ACTIVE_TRIES = Number(process.env.SYSTEMCTL_RETRIES || 6),
  ACTIVE_INTERVAL_MS = Number(process.env.SYSTEMCTL_INTERVAL_MS || 3000)

const sshLive = (cmd) => ssh(HOST, cmd, { stdio: "inherit" }),
  sshLiveRetry = (cmd, label) => ssh(HOST, cmd, { stdio: "inherit", retry: { tries: 3, label } }),
  sshCap = (cmd) => ssh(HOST, cmd).trim(),
  remoteBash = (cmd) => "bash -c '" + cmd.replaceAll("'", "'\\''") + "'",
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const parseKv = (out) =>
  Object.fromEntries(out.split("\n").filter(Boolean).map((l) => l.split("=")))

const writeOutput = (key, value) => {
  const f = process.env.GITHUB_OUTPUT
  if (f) appendFileSync(f, key + "=" + (typeof value === "string" ? value : JSON.stringify(value)) + "\n")
}

const captureHashes = () =>
  parseKv(sshCap(remoteBash(
    SUBS.map((s) => "echo " + s + "=$(cd " + APP + "/" + s + " && git rev-parse --short HEAD 2>/dev/null || echo ?)").join("; "),
  )))

// 全子仓拉 dev：-fB 丢弃本地脏改动并重置到 origin/dev（服务器不应有本地提交，i18n/dist 不在此仓产生）
const checkout = () => {
  const script = ["set -e"].concat(SUBS.flatMap((s) => [
    "cd " + APP + "/" + s,
    "git fetch -q origin dev",
    "git checkout -q -fB dev origin/dev",
  ])).join("; ")
  sshLiveRetry(remoteBash(script), "checkout-all")
}

const waitActive = async () => {
  for (let i = 0; i < ACTIVE_TRIES; ++i) {
    if (sshCap("systemctl is-active " + SERVICE + " || true") === "active") return
    console.log("is-active " + (i + 1) + "/" + ACTIVE_TRIES + ": not yet")
    await sleep(ACTIVE_INTERVAL_MS)
  }
  sshLive(remoteBash("sudo journalctl -u " + SERVICE + " -n 200 --no-pager; systemctl status " + SERVICE + " --no-pager || true"))
  throw new Error(SERVICE + " not active after restart")
}

// 服务器内部探活 127.0.0.1:3000（绕开 nginx/CDN，直测后端）；脚本恒 exit 0，靠输出标记判定
const probe = () => {
  const url = "http://127.0.0.1:" + PORT + "/",
    script = "code=; for i in $(seq 1 " + PROBE_TRIES + "); do " +
      "code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 " + url + " || true); " +
      "case \"$code\" in 2*|3*|4*) echo PROBE_OK=$code; exit 0;; esac; " +
      "sleep " + PROBE_INTERVAL_S + "; done; echo PROBE_FAIL=$code"
  const out = sshCap(remoteBash(script))
  console.log("probe " + url + " -> " + out)
  if (!out.includes("PROBE_OK")) {
    sshLive(remoteBash("sudo journalctl -u " + SERVICE + " -n 200 --no-pager || true"))
    throw new Error("HTTP probe failed: " + out)
  }
}

const main = async () => {
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  writeOutput("old_hashes", old_hashes)

  checkout()

  const new_hashes = captureHashes()
  console.log("new hashes:", new_hashes)
  writeOutput("new_hashes", new_hashes)

  // alpha_cn.sh(=ExecStart) 在 restart 时自身跑 bun i + ./build.sh，故此处只 restart
  sshLive("sudo systemctl restart " + SERVICE)
  await sleep(RESTART_GRACE_MS)
  await waitActive()

  console.log(SERVICE + " active, probing")
  probe()

  sshLive(remoteBash("sudo journalctl -u " + SERVICE + " -n 50 --no-pager || true"))
}

await main()
process.exit()
