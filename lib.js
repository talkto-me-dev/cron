import { spawnSync } from "child_process"
import GITCODE_TOKEN from "./conf/GITCODE_TOKEN.js"
import FEISHU_WEBHOOK from "./conf/FEISHU_WEBHOOK.js"

export const SRV_REPO = "myaier/srv",
  TARGET_BRANCH = "dev", // TODO: 改成 main
  GITCODE_API = "https://api.gitcode.com/api/v5",
  DB_DIFF_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/db_diff.yml",
  DB_APPLY_ACTION_URL = "https://github.com/talkto-me-dev/cron/actions/workflows/db_apply.yml"

export const run = (cmd, args, opts) => {
  const { redact, ...spawn_opts } = opts || {}
  const r = spawnSync(cmd, args, { encoding: "utf-8", ...spawn_opts })
  if (r.status !== 0) {
    let msg = r.stderr || r.stdout || `exit ${r.status}`
    if (redact) for (const s of redact) msg = msg.replaceAll(s, "***")
    throw new Error(`${cmd} failed: ${msg}`)
  }
  return r.stdout
}

export const notifyFeishu = async (title, lines) => {
  const text = `${title}\n\n${lines.join("\n")}`
  await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  })
}

export const cloneSrvRepo = () => {
  const url = `https://oauth2:${GITCODE_TOKEN}@gitcode.com/${SRV_REPO}.git`
  run("git", ["clone", "--depth=1", "-b", TARGET_BRANCH, url, "srv"], { redact: [GITCODE_TOKEN] })
}

export { GITCODE_TOKEN }
