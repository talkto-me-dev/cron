#!/usr/bin/env bun

import {
  run,
  notifyFeishu,
  cloneSrvGithub,
  cloneIConf,
  tidbConf,
  assertEnv,
  dbBranch,
  dispatchWorkflow,
  SERVER_DEPLOY_ACTION_URL,
} from "../lib.js"
import { buildDatabaseUrl } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const main = async () => {
  cloneSrvGithub(dbBranch(ENV), "srv-db")
  cloneIConf()

  const tidb = await tidbConf(ENV),
    env = { ...process.env, DATABASE_URL: buildDatabaseUrl(tidb) }

  const dbmate = (...args) =>
    run("dbmate", ["--migrations-dir", "srv-db/migration/sql", ...args], { env, stdio: "inherit" })

  console.log("applying migrations (env=" + ENV + ")...")
  try {
    dbmate("--wait", "status")
    dbmate("--wait", "up")
    dbmate("status")
  } catch (e) {
    await notifyFeishu("❌ DB Migration 上线失败 (" + ENV + ")", [e.message])
    throw e
  }

  console.log("migrations applied, dispatching deploy")
  dispatchWorkflow("server_deploy.yml", { env: ENV })

  await notifyFeishu("✅ DB Migration 上线完成 (" + ENV + ")", [
    "已触发 server_deploy: " + SERVER_DEPLOY_ACTION_URL,
  ])
}

await main()
process.exit()
