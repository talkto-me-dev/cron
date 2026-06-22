#!/usr/bin/env bun

import { appendFileSync } from "fs"
import { ssh } from "../lib.js"

const HOST = "cn",
  APP = "/home/talktome/site/talkto.me/alpha",
  SERVICE = "talkto-bio-alpha",
  PORT = 3000,
  TIDB_DSN = "-h127.0.0.1 -P4000 -uroot ai",
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
  if (!f) return
  const s = typeof value === "string" ? value : JSON.stringify(value),
    d = "__EOF_" + key
  if (s.includes("\n")) appendFileSync(f, key + "<<" + d + "\n" + s + "\n" + d + "\n")
  else appendFileSync(f, key + "=" + s + "\n")
}

const captureHashes = () =>
  parseKv(sshCap(remoteBash(
    SUBS.map((s) => "echo " + s + "=$(cd " + APP + "/" + s + " && git rev-parse --short HEAD 2>/dev/null || echo ?)").join("; "),
  )))

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

const migrate = () => {
  const at = "cd " + APP + "/srv && mysqldef " + TIDB_DSN,
    diff = sshCap(remoteBash(at + " --dry-run < tidb.sql"))
  console.log("mysqldef dry-run:\n" + diff)
  writeOutput("mysqldef_diff", diff)
  if (/MODIFY\s+COLUMN/i.test(diff)) console.log("⚠️ mysqldef diff 含 MODIFY COLUMN（类型变更可能截断数据，详见上）")
  sshLive(remoteBash(at + " < tidb.sql"))
}

const main = async () => {
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  writeOutput("old_hashes", old_hashes)

  checkout()

  const new_hashes = captureHashes()
  console.log("new hashes:", new_hashes)
  writeOutput("new_hashes", new_hashes)

  migrate()

  sshLive("sudo systemctl restart " + SERVICE)
  await sleep(RESTART_GRACE_MS)
  await waitActive()

  console.log(SERVICE + " active, probing")
  probe()

  sshLive(remoteBash("sudo journalctl -u " + SERVICE + " -n 50 --no-pager || true"))
}

await main()
process.exit()
