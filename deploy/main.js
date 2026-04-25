#!/usr/bin/env bun

import {
  ssh,
  run,
  notifyFeishu,
  assertEnv,
  GITCODE_TOKEN,
} from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")
const SUBS = ["lib", "srv", "conf"]
const ENV_DIR = "/root/site/talkto.me/" + ENV
const SERVICE = "talkto_me_" + ENV
const HEALTH_URL = ENV === "alpha" ? "https://api.018007.xyz/" : "https://api.talkto.me/"

const subDir = (sub) => ENV_DIR + "/" + sub
const targetBranch = (sub) => (sub === "srv" ? "deploy" : "dev")

const sshCap = (cmd) => ssh("c1", cmd).trim()
const sshLive = (cmd) => ssh("c1", cmd, { stdio: "inherit" })

const captureHashes = () => {
  const r = {}
  for (const sub of SUBS) r[sub] = sshCap("cd " + subDir(sub) + " && git rev-parse HEAD")
  return r
}

const updateRepos = () => {
  for (const sub of SUBS) {
    const br = targetBranch(sub)
    sshLive("cd " + subDir(sub) + " && git fetch origin && git checkout -B " + br + " origin/" + br)
  }
}

const restart = () => sshLive("systemctl restart " + SERVICE)

const isActive = () => {
  const r = ssh("c1", "systemctl is-active " + SERVICE).trim()
  return r === "active"
}

const httpProbe = async () => {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.status >= 200 && res.status < 400) return true
      console.log("probe " + (i + 1) + ": HTTP " + res.status)
    } catch (e) {
      console.log("probe " + (i + 1) + ": " + e.message)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return false
}

const tailLog = (lines) =>
  sshLive("journalctl -u " + SERVICE + " -n " + lines + " --no-pager")

const tailStatus = () =>
  sshLive("systemctl status " + SERVICE + " --no-pager")

const rollback = (old_hashes) => {
  for (const sub of SUBS) {
    sshLive("cd " + subDir(sub) + " && git reset --hard " + old_hashes[sub])
  }
  restart()
}

const fmtHashes = (old_h, new_h) =>
  SUBS.map((s) => s + ": " + old_h[s].slice(0, 7) + " -> " + new_h[s].slice(0, 7)).join("\n")

const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  run("git", ["clone", "-b", branch, url, path], { redact: [GITCODE_TOKEN], stdio: "inherit" })
}

const setupFrontendWorkdir = () => {
  cloneFull("myaier/site", "dev", "workdir/site")
  cloneFull("myaier/vibe", "dev", "workdir/site/vibe")
  cloneFull("myaier/static", "dev", "workdir/site/static")
  cloneFull("myaier/lib", "dev", "workdir/lib")
  cloneFull("myaier/i.conf", "dev", "workdir/conf")
}

const runFrontend = () => {
  setupFrontendWorkdir()
  const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
  run("bash", ["-c", "cd workdir/site && bun i && " + script], { stdio: "inherit" })
}

const runBackend = async () => {
  const old_hashes = captureHashes()
  console.log("old hashes:", old_hashes)
  try {
    updateRepos()
    restart()
    if (!isActive()) throw new Error(SERVICE + " is not active after restart")
    console.log(SERVICE + " active, probing HTTP " + HEALTH_URL)
    if (!(await httpProbe())) throw new Error("HTTP probe failed " + HEALTH_URL)
    tailLog(50)
    const new_hashes = captureHashes()
    return [old_hashes, new_hashes]
  } catch (e) {
    console.error("backend failed:", e.message)
    console.log("rolling back...")
    try {
      rollback(old_hashes)
      console.log("rollback done, post-rollback active=" + isActive())
    } catch (re) {
      console.error("rollback also failed:", re.message)
    }
    tailLog(200)
    tailStatus()
    throw e
  }
}

const main = async () => {
  let backend_ok = false,
    frontend_ok = false,
    err = null,
    old_hashes,
    new_hashes
  try {
    ;[old_hashes, new_hashes] = await runBackend()
    backend_ok = true
    runFrontend()
    frontend_ok = true
  } catch (e) {
    err = e
  }

  if (backend_ok && frontend_ok) {
    await notifyFeishu("✅ 部署完成 (" + ENV + ")", [
      "三仓 hash 变更：",
      fmtHashes(old_hashes, new_hashes),
    ])
  } else if (!backend_ok) {
    await notifyFeishu("❌ 部署失败 (" + ENV + ")", [
      "阶段：backend",
      "错误：" + (err?.message || "unknown"),
      "已尝试自动回滚。",
    ])
  } else {
    await notifyFeishu("⚠️ 前端失败 (" + ENV + ")", [
      "后端已部署成功，前端失败。CF Pages 历史版本手动切换。",
      "错误：" + (err?.message || "unknown"),
      "三仓 hash：",
      fmtHashes(old_hashes, new_hashes),
    ])
  }

  if (err) process.exit(1)
}

await main()
process.exit()
