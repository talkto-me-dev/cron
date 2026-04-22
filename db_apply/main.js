#!/usr/bin/env bun

import {
  run, notifyFeishu, cloneSrvDeploy, cloneIConf,
  tidbConf, assertEnv, DB_DIFF_ACTION_URL,
} from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const buildDatabaseUrl = (tidb) => {
  const { username, password, hostname, port, database, tls } = tidb
  return "mysql://" + username + ":" + password + "@" + hostname + ":" + port + "/" + database + (tls ? "?tls=true" : "")
}

const main = async () => {
  cloneSrvDeploy(ENV)
  cloneIConf()

  const tidb = await tidbConf(ENV),
    env = { ...process.env, DATABASE_URL: buildDatabaseUrl(tidb) }
  console.log("applying migrations (env=" + ENV + ")...")

  const dbmate = (...args) => run("dbmate", ["--migrations-dir", "srv-deploy/migration/sql", ...args], { env, stdio: "inherit" })

  dbmate("--wait", "status")
  dbmate("--wait", "up")
  console.log("migrations applied")

  dbmate("status")

  await notifyFeishu("✅ DB Migration 上线完成 (" + ENV + ")", [
    "所有未应用的 migration 已执行成功。", "",
    "db_diff Action: " + DB_DIFF_ACTION_URL,
  ])
}

await main()
process.exit()
