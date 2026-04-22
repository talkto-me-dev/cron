import { spawnSync } from "child_process"
import GITCODE_TOKEN from "./conf/GITCODE_TOKEN.js"
import FEISHU_WEBHOOK from "./conf/FEISHU_WEBHOOK.js"

export const SRV_REPO = "myaier/srv",
  CONF_REPO = "myaier/i.conf",
  DEV_BRANCH = "dev",
  GITCODE_API = "https://api.gitcode.com/api/v5",
  DB_DIFF_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/db_diff.yml",
  DB_APPLY_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/db_apply.yml"

export const ENVS = ["alpha", "prod"]

export const deployBranch = (env) => "deploy-" + env

export const assertEnv = (env) => {
  if (!ENVS.includes(env)) throw new Error("invalid env: " + env + " (expect alpha|prod)")
  return env
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

export const notifyFeishu = async (title, lines) => {
  const text = title + "\n\n" + lines.join("\n")
  await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  })
}

const cloneGitcode = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  run("git", ["clone", "--depth=1", "-b", branch, url, path], { redact: [GITCODE_TOKEN] })
}

export const cloneSrvDev = () => cloneGitcode(SRV_REPO, DEV_BRANCH, "srv")
export const cloneSrvDeploy = (env) => cloneGitcode(SRV_REPO, deployBranch(assertEnv(env)), "srv-deploy")
export const cloneIConf = () => cloneGitcode(CONF_REPO, DEV_BRANCH, "iconf")

export const tidbConf = async (env) => (await import("../iconf/" + assertEnv(env) + "/TIDB.js")).default

export { GITCODE_TOKEN }
