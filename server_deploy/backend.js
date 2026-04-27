#!/usr/bin/env bun

import { appendFileSync } from "fs"
import { ssh, assertEnv } from "../lib.js"
import { SUBS, targetBranch, subDir as _subDir, healthUrl } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || ""),
  SERVICE = "talkto_me_" + ENV,
  BOT_SERVICE = SERVICE + "_bot",
  HEALTH_URL = healthUrl(ENV),
  PROBE_RETRIES = Number(process.env.HTTP_PROBE_RETRIES || 12),
  PROBE_INTERVAL_MS = Number(process.env.HTTP_PROBE_INTERVAL_MS || 5000)

const subDir = (sub) => _subDir(ENV, sub)
const sshLive = (cmd) => ssh("c1", cmd, { stdio: "inherit" })
const sshCap = (cmd) => ssh("c1", cmd).trim()
const remoteBash = (cmd) => "bash -c " + JSON.stringify(cmd)

const captureHashes = () => {
  const r = {}
  for (const sub of SUBS) {
    r[sub] = sshCap("cd " + subDir(sub) + " && git rev-parse origin/" + targetBranch(sub))
  }
  return r
}

const httpProbe = async () => {
  for (let i = 0; i < PROBE_RETRIES; i++) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.status >= 200 && res.status < 400) return true
      console.log("probe " + (i + 1) + ": HTTP " + res.status)
    } catch (e) {
      console.log("probe " + (i + 1) + ": " + e.message)
    }
    await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS))
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
    sshLive("cd " + subDir(sub) + " && git fetch -q origin +" + br + ":refs/remotes/origin/" + br)
  }
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  writeOutput("old_hashes", old_hashes)

  for (const sub of SUBS) {
    const br = targetBranch(sub)
    sshLive(
      remoteBash(
        "cd " + subDir(sub) +
        " && git checkout -q -B " + br + " origin/" + br +
        " && if [ -f package.json ]; then bun i; fi",
      ),
    )
  }

  sshLive("systemctl restart " + SERVICE)
  sshLive("systemctl restart " + BOT_SERVICE)

  if (sshCap("systemctl is-active " + SERVICE) !== "active") {
    sshLive("journalctl -u " + SERVICE + " -n 200 --no-pager")
    sshLive("systemctl status " + SERVICE + " --no-pager")
    throw new Error(SERVICE + " is not active after restart")
  }

  if (sshCap("systemctl is-active " + BOT_SERVICE) !== "active") {
    sshLive("journalctl -u " + BOT_SERVICE + " -n 200 --no-pager")
    sshLive("systemctl status " + BOT_SERVICE + " --no-pager")
    throw new Error(BOT_SERVICE + " is not active after restart")
  }

  console.log(SERVICE + " & " + BOT_SERVICE + " active, probing HTTP " + HEALTH_URL)
  if (!(await httpProbe())) {
    sshLive("journalctl -u " + SERVICE + " -n 200 --no-pager")
    throw new Error("HTTP probe failed " + HEALTH_URL)
  }

  sshLive("journalctl -u " + SERVICE + " -n 50 --no-pager")
  sshLive("journalctl -u " + BOT_SERVICE + " -n 50 --no-pager")
  const new_hashes = captureHashes()
  writeOutput("new_hashes", new_hashes)
  console.log("new hashes:", new_hashes)
}

await main()
process.exit()
