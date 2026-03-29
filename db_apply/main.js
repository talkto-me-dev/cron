#!/usr/bin/env bun

import TIDB from "../conf/TIDB.js"
import { run, notifyFeishu, cloneSrvRepo, DB_DIFF_ACTION_URL } from "../lib.js"

const buildDatabaseUrl = () => {
  const { username, password, hostname, port, database, tls } = TIDB
  return `mysql://${username}:${password}@${hostname}:${port}/${database}${tls ? "?tls=true" : ""}`
}

const main = async () => {
  cloneSrvRepo()

  const env = { ...process.env, DATABASE_URL: buildDatabaseUrl() }
  console.log("applying migrations...")

  const dbmate = (...args) => run("dbmate", ["--migrations-dir", "srv/migration/sql", ...args], { env, stdio: "inherit" })

  dbmate("--wait", "status")
  dbmate("--wait", "up")
  console.log("migrations applied")

  dbmate("status")

  await notifyFeishu("✅ DB Migration 上线完成", [
    "所有未应用的 migration 已执行成功。", "",
    `db_diff Action: ${DB_DIFF_ACTION_URL}`,
  ])
}

await main()
process.exit()
