#!/usr/bin/env bun

import { appendFileSync } from "fs"
import { ssh, assertEnv } from "../lib.js"
import { SUBS, targetBranch, subDir as _subDir, loadSiteConf, bashRetryFn } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || ""),
  SERVICE = "talkto_me_" + ENV,
  RUN_SERVICE = SERVICE + "_srv_run",
  PROBE_RETRIES = Number(process.env.HTTP_PROBE_RETRIES || 12),
  PROBE_INTERVAL_MS = Number(process.env.HTTP_PROBE_INTERVAL_MS || 5000),
  PROBE_TIMEOUT_MS = Number(process.env.HTTP_PROBE_TIMEOUT_MS || 8000),
  RESTART_GRACE_MS = Number(process.env.RESTART_GRACE_MS || 8000)

const { api_url: HEALTH_URL } = await loadSiteConf(ENV)

const subDir = (sub) => _subDir(ENV, sub)
const sshLive = (cmd) => ssh("c1", cmd, { stdio: "inherit" })
const sshLiveRetry = (cmd, label) => ssh("c1", cmd, { stdio: "inherit", retry: { tries: 3, label } })
const sshCap = (cmd) => ssh("c1", cmd).trim()
const remoteBash = (cmd) => "bash -c '" + cmd.replaceAll("'", "'\\''") + "'"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const captureHashes = () => {
  const r = {}
  for (const sub of SUBS) {
    r[sub] = sshCap("cd " + subDir(sub) + " && git rev-parse origin/" + targetBranch(sub))
  }
  return r
}

const httpProbe = async () => {
  for (let i = 0; i < PROBE_RETRIES; i++) {
    await sleep(PROBE_INTERVAL_MS)
    const t0 = Date.now()
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "cache-control": "no-cache", "user-agent": "deploy-probe/1" },
        redirect: "manual",
      })
      const ms = Date.now() - t0
      if (res.status < 500) {
        console.log("probe " + (i + 1) + ": HTTP " + res.status + " (" + ms + "ms) ok")
        return true
      }
      console.log("probe " + (i + 1) + ": HTTP " + res.status + " (" + ms + "ms)")
    } catch (e) {
      console.log("probe " + (i + 1) + ": " + (e.name || "err") + " " + e.message + " (" + (Date.now() - t0) + "ms)")
    }
  }
  return false
}

const writeOutput = (key, value) => {
  const f = process.env.GITHUB_OUTPUT
  if (!f) return
  appendFileSync(f, key + "=" + JSON.stringify(value) + "\n")
}

const main = async () => {
  for (const sub of SUBS) {
    const br = targetBranch(sub)
    sshLiveRetry(
      "cd " + subDir(sub) + " && git fetch -q origin +" + br + ":refs/remotes/origin/" + br,
      "fetch " + sub,
    )
  }
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  writeOutput("old_hashes", old_hashes)

  for (const sub of SUBS) {
    const br = targetBranch(sub)
    const script = [
      "set -e",
      bashRetryFn,
      "bun_install() { bun i || { rm -rf ~/.bun/install/cache && bun i; }; }",
      "cd " + subDir(sub),
      "git checkout -q -B " + br + " origin/" + br,
      "if [ -f package.json ]; then retry bun_install; grep -q '\"postinstall\"' package.json && bun run postinstall || true; fi",
    ].join("; ")
    sshLive(remoteBash(script))
  }

  for (const svc of [SERVICE, RUN_SERVICE]) sshLive("systemctl restart " + svc)
  await sleep(RESTART_GRACE_MS)

  for (const svc of [SERVICE, RUN_SERVICE]) {
    if (sshCap("systemctl is-active " + svc + " || true") === "active") continue
    sshLive("journalctl -u " + svc + " -n 200 --no-pager")
    sshLive("systemctl status " + svc + " --no-pager")
    throw new Error(svc + " is not active after restart")
  }

  console.log(SERVICE + " & " + RUN_SERVICE + " active, probing HTTP " + HEALTH_URL)
  if (!(await httpProbe())) {
    sshLive("journalctl -u " + SERVICE + " -n 200 --no-pager")
    throw new Error("HTTP probe failed " + HEALTH_URL)
  }

  for (const svc of [SERVICE, RUN_SERVICE]) sshLive("journalctl -u " + svc + " -n 50 --no-pager")
  const new_hashes = captureHashes()
  writeOutput("new_hashes", new_hashes)
  console.log("new hashes:", new_hashes)
}

await main()
process.exit()
