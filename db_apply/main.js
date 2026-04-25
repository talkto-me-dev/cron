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
  DB_APPLY_ACTION_URL,
} from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const buildDatabaseUrl = (tidb) => {
  const { username, password, hostname, port, database, tls } = tidb
  return (
    "mysql://" + username + ":" + password + "@" + hostname + ":" + port + "/" + database +
    (tls ? "?tls=true" : "")
  )
}

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
    await notifyFeishu("❌ DB Migration 上线失败 (" + ENV + ")", [
      e.message,
      "",
      "Action: " + DB_APPLY_ACTION_URL,
    ])
    throw e
  }

  console.log("migrations applied, dispatching deploy")
  dispatchWorkflow("server_deploy.yml", { env: ENV })

  await notifyFeishu("✅ DB Migration 上线完成 (" + ENV + ")", [
    "所有未应用的 migration 已执行成功，已触发 deploy。",
  ])
}

await main()
process.exit()
