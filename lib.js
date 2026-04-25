import { spawnSync } from "child_process"
import { resolve, join } from "path"
import { chmodSync } from "fs"
import { pathToFileURL } from "url"
import ROOT from "./ROOT.js"
import FEISHU_WEBHOOK from "./conf/FEISHU_WEBHOOK.js"

// GITCODE_TOKEN 由 Actions secret 注入到 env（自动 redact）；本地直跑需 export
const GITCODE_TOKEN = process.env.GITCODE_TOKEN
if (!GITCODE_TOKEN) throw new Error("GITCODE_TOKEN env not set")

export const SRV_REPO = "myaier/srv",
  SRV_GITHUB_REPO = "talkto-me-dev/srv",
  CRON_GITHUB_REPO = "talkto-me-dev/cron",
  CONF_REPO = "myaier/i.conf",
  DEV_BRANCH = "dev",
  DEPLOY_BRANCH = "deploy",
  GITCODE_API = "https://api.gitcode.com/api/v5",
  DB_APPLY_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/db_apply.yml",
  DEPLOY_PIPELINE_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/deploy_pipeline.yml",
  SERVER_DEPLOY_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/server_deploy.yml"

export const ENVS = ["alpha", "prod"]

export const deployBranch = (env) => "deploy-" + env
export const dbBranch = (env) => "deploy-" + assertEnv(env) + "-db"

export const assertEnv = (env) => {
  if (!ENVS.includes(env)) throw new Error("invalid env: " + env + " (expect alpha|prod)")
  return env
}

const ghPat = () => {
  const t = process.env.GH_PAT || process.env.GH_TOKEN
  if (!t) throw new Error("GH_PAT/GH_TOKEN env not set")
  return t
}

export const run = (cmd, args, opts) => {
  const { redact, ...spawn_opts } = opts || {}
  const r = spawnSync(cmd, args, { encoding: "utf-8", ...spawn_opts })
  if (r.status !== 0) {
    let msg = r.stderr || r.stdout || "exit " + r.status
    if (redact) for (const s of redact) msg = msg.replaceAll(s, "***")
    throw new Error(cmd + " failed: " + msg)
  }
  return r.stdout
}

export const actionRunUrl = () => {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return ""
  return GITHUB_SERVER_URL + "/" + GITHUB_REPOSITORY + "/actions/runs/" + GITHUB_RUN_ID
}

export const notifyFeishu = async (title, lines) => {
  const url = actionRunUrl()
  const all = url ? [...lines, "", "Action: " + url] : lines
  const text = title + "\n\n" + all.join("\n")
  const res = await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  })
  const body = await res.text()
  console.log("[feishu " + res.status + "] " + title + " -> " + body.slice(0, 200))
}

const cloneGitcode = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  run("git", ["clone", "--depth=1", "-b", branch, url, path], { redact: [GITCODE_TOKEN] })
}

export const cloneSrvDev = () => cloneGitcode(SRV_REPO, DEV_BRANCH, "srv")
export const cloneSrvDeploy = (env) => cloneGitcode(SRV_REPO, deployBranch(assertEnv(env)), "srv-deploy")
export const cloneIConf = () => cloneGitcode(CONF_REPO, DEV_BRANCH, "iconf")

const cloneGithub = (repo, branch, path) => {
  const t = ghPat(),
    url = "https://oauth2:" + t + "@github.com/" + repo + ".git"
  run("git", ["clone", "--depth=1", "-b", branch, url, path], { redact: [t] })
}

export const cloneSrvGithub = (branch, path) => cloneGithub(SRV_GITHUB_REPO, branch, path)

const SSH_DIR = join(ROOT, "conf/ssh"),
  SSH_CONFIG = join(SSH_DIR, "ssh_config"),
  SSH_KEY = join(SSH_DIR, "id_ed25519")

let _ssh_inited = false
const sshInit = () => {
  if (_ssh_inited) return
  chmodSync(SSH_KEY, 0o600)
  _ssh_inited = true
}

export const ssh = (host, cmd, opts) => {
  sshInit()
  return run(
    "ssh",
    ["-F", SSH_CONFIG, "-i", SSH_KEY, "-o", "StrictHostKeyChecking=no", host, cmd],
    opts || {},
  )
}

export const dispatchWorkflow = (workflow, inputs) => {
  const args = ["workflow", "run", workflow, "--repo", CRON_GITHUB_REPO]
  for (const [k, v] of Object.entries(inputs || {})) args.push("-f", k + "=" + v)
  return run("gh", args, { stdio: "inherit", env: { ...process.env, GH_TOKEN: ghPat() } })
}

export const tidbConf = async (env) => {
  const p = resolve(process.cwd(), "iconf", assertEnv(env), "TIDB.js")
  return (await import(pathToFileURL(p).href)).default
}

export { GITCODE_TOKEN }
