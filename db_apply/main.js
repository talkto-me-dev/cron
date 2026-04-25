#!/usr/bin/env bun

import {
  run,
  notifyFeishu,
  cloneSrvFromGithub,
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
  cloneSrvFromGithub(dbBranch(ENV), "srv-db")
  cloneIConf()

  const tidb = await tidbConf(ENV),
    env = { ...process.env, DATABASE_URL: buildDatabaseUrl(tidb) }

  const dbmate = (...args) =>
    run("dbmate", ["--migrations-dir", "srv-db/migration/sql", ...args], { env, stdio: "inherit" })
  // 单独捕获 status 输出，失败通知里附上让人快速判断 schema 状态
  const dbmateStatus = () => {
    try {
      return run("dbmate", ["--migrations-dir", "srv-db/migration/sql", "status"], { env }).trim()
    } catch (se) {
      return "(dbmate status 也失败: " + se.message + ")"
    }
  }

  console.log("applying migrations (env=" + ENV + ")...")
  try {
    dbmate("--wait", "status")
    dbmate("--wait", "up")
    dbmate("status")
  } catch (e) {
    // dbmate 部分成功 → DB 已变更但代码未部署，schema 领先于代码；通知里附 status
    await notifyFeishu("❌ DB Migration 上线失败 (" + ENV + ")", [
      e.message,
      "",
      "可能部分 migration 已应用，schema 与代码不一致。",
      "当前 dbmate status:",
      dbmateStatus(),
    ])
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
