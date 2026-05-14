#!/usr/bin/env bun

import { appendFileSync } from "fs"
import { ssh, assertEnv } from "../lib.js"
import { SUBS, targetBranch, subDir as _subDir, loadSiteConf, bashRetryFn, formatOutput } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || ""),
  SERVICE = "talkto_me_" + ENV,
  RUN_SERVICE = SERVICE + "_srv_run",
  SERVICES = [SERVICE, RUN_SERVICE],
  PROBE_RETRIES = Number(process.env.HTTP_PROBE_RETRIES || 12),
  PROBE_INTERVAL_MS = Number(process.env.HTTP_PROBE_INTERVAL_MS || 5000),
  PROBE_TIMEOUT_MS = Number(process.env.HTTP_PROBE_TIMEOUT_MS || 8000),
  RESTART_GRACE_MS = Number(process.env.RESTART_GRACE_MS || 8000),
  SYSTEMCTL_RETRIES = Number(process.env.SYSTEMCTL_RETRIES || 6),
  SYSTEMCTL_INTERVAL_MS = Number(process.env.SYSTEMCTL_INTERVAL_MS || 3000)

const { api_url: HEALTH_URL, main_host: MAIN_HOST } = await loadSiteConf(ENV)

const subDir = (sub) => _subDir(ENV, sub)
const sshLive = (cmd) => ssh("c1", cmd, { stdio: "inherit" })
const sshLiveRetry = (cmd, label) => ssh("c1", cmd, { stdio: "inherit", retry: { tries: 3, label } })
const sshCap = (cmd) => ssh("c1", cmd).trim()
const remoteBash = (cmd) => "bash -c '" + cmd.replaceAll("'", "'\\''") + "'"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SUB_BR = SUBS.map((s) => [s, targetBranch(s)])

const parseKv = (out) =>
  Object.fromEntries(out.split("\n").filter(Boolean).map((l) => l.split("=")))

const journalctl = (svc, n) => "journalctl -u " + svc + " -n " + n + " --no-pager"

const captureHashes = () =>
  parseKv(sshCap(remoteBash(
    SUB_BR.map(([s, br]) => "echo " + s + "=$(cd " + subDir(s) + " && git rev-parse origin/" + br + ")").join("; "),
  )))

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
  appendFileSync(f, key + "=" + formatOutput(value) + "\n")
}

const checkServicesStatus = () =>
  parseKv(sshCap(remoteBash(
    SERVICES.map((s) => "echo " + s + "=$(systemctl is-active " + s + " || true)").join("; "),
  )))

const waitServicesActive = async () => {
  for (let i = 0; i < SYSTEMCTL_RETRIES; i++) {
    const status = checkServicesStatus()
    const failed = SERVICES.filter((s) => status[s] !== "active")
    if (failed.length === 0) return
    console.log("systemctl check " + (i + 1) + "/" + SYSTEMCTL_RETRIES + ": " + failed.join(",") + " not active yet")
    if (i < SYSTEMCTL_RETRIES - 1) await sleep(SYSTEMCTL_INTERVAL_MS)
  }
  const status = checkServicesStatus()
  for (const svc of SERVICES) {
    if (status[svc] === "active") continue
    sshLive(remoteBash(journalctl(svc, 200) + "; systemctl status " + svc + " --no-pager"))
    throw new Error(svc + " is not active after restart")
  }
}

const main = async () => {
  const fetchCmd = SUB_BR.map(([s, br]) =>
    "cd " + subDir(s) + " && git fetch -q origin +" + br + ":refs/remotes/origin/" + br,
  ).join("; ")
  sshLiveRetry(remoteBash("set -e; " + fetchCmd), "fetch-all")

  writeOutput("main_host", MAIN_HOST)
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  writeOutput("old_hashes", old_hashes)

  const installScript = [
    "set -e",
    bashRetryFn,
    "bun_install() { bun i || { rm -rf ~/.bun/install/cache && bun i; }; }",
    ...SUB_BR.flatMap(([s, br]) => [
      "cd " + subDir(s),
      "git checkout -q -B " + br + " origin/" + br,
      "if [ -f package.json ]; then retry bun_install; grep -q '\"postinstall\"' package.json && bun run postinstall || true; fi",
    ]),
  ].join("; ")
  sshLive(remoteBash(installScript))

  sshLive(SERVICES.map((s) => "systemctl restart " + s).join(" && "))
  await sleep(RESTART_GRACE_MS)

  await waitServicesActive()

  console.log(SERVICES.join(" & ") + " active, probing HTTP " + HEALTH_URL)
  if (!(await httpProbe())) {
    sshLive(journalctl(SERVICE, 200))
    throw new Error("HTTP probe failed " + HEALTH_URL)
  }

  sshLive(remoteBash(SERVICES.map((s) => journalctl(s, 50)).join("; ")))
  const new_hashes = captureHashes()
  writeOutput("new_hashes", new_hashes)
  console.log("new hashes:", new_hashes)
}

await main()
process.exit()
