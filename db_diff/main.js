#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs"
import {
  run, notifyFeishu, cloneSrvDev, cloneSrvDeploy, cloneIConf,
  tidbConf, assertEnv, deployBranch, GITCODE_TOKEN,
  SRV_REPO, GITCODE_API,
  DB_DIFF_ACTION_URL, DB_APPLY_ACTION_URL,
} from "../lib.js"
import { schemaDiff, migrationName } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const stripNonTableDdl = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*(CREATE\s+DATABASE|USE\s+|DROP\s+DATABASE)/i.test(l))
    .join("\n")

const dumpOnlineSchema = (tidb) =>
  run("mysqldump", [
    "--no-data", "--skip-comments", "--compact", "--ssl-mode=REQUIRED",
    "--ignore-table=" + tidb.database + ".schema_migrations",
    "-h" + tidb.hostname, "-P" + tidb.port,
    "-u" + tidb.username,
    tidb.database,
  ], { env: { ...process.env, MYSQL_PWD: tidb.password } })

const genMigrationFile = (diff_sql) => {
  const name = migrationName(diff_sql)
  writeFileSync("srv-deploy/migration/sql/" + name, "-- migrate:up\n" + diff_sql + "\n\n-- migrate:down\n")
  return name
}

const pushBranch = (branch, migration_name) => {
  const git = (...args) => run("git", args, { cwd: "srv-deploy" })
  git("checkout", "-b", branch)
  git("add", "migration/sql/")
  git("commit", "-mauto(" + ENV + "): " + migration_name)
  git("push", "origin", branch)
}

const createPr = async (branch, migration_name, diff_sql) => {
  const base = deployBranch(ENV),
    body = "自动生成的 schema diff migration (env=" + ENV + ")\n\n```sql\n" + diff_sql + "\n```"
  const resp = await fetch(GITCODE_API + "/repos/" + SRV_REPO + "/pulls", {
    method: "POST",
    headers: { "Content-Type": "application/json", "PRIVATE-TOKEN": GITCODE_TOKEN },
    body: JSON.stringify({ title: "auto(" + ENV + "): " + migration_name, head: branch, base, body }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error("gitcode API: " + JSON.stringify(data))
  return data.html_url || data.web_url || data._links?.html?.href
}

const main = async () => {
  cloneSrvDev()
  cloneSrvDeploy(ENV)
  cloneIConf()

  const tidb = await tidbConf(ENV),
    online_clean = stripNonTableDdl(dumpOnlineSchema(tidb))
  writeFileSync("online_schema.sql", online_clean)

  const desired_file = "srv/tidb.sql"
  if (!existsSync(desired_file)) throw new Error("srv/tidb.sql not found")

  writeFileSync("desired_schema.sql", stripNonTableDdl(readFileSync(desired_file, "utf-8")))

  const diff_sql = schemaDiff("online_schema.sql", "desired_schema.sql")
  if (!diff_sql) {
    console.log("schema 无差异")
    await notifyFeishu("✅ DB Schema Diff (" + ENV + ")", [
      "线上 schema 与 tidb.sql 一致，无需迁移。", "",
      "db_diff Action: " + DB_DIFF_ACTION_URL,
    ])
    return
  }

  console.log("diff SQL:\n", diff_sql)

  const migration_name = genMigrationFile(diff_sql),
    branch = "auto/db_diff-" + ENV + "-" + migration_name.slice(0, 14)

  pushBranch(branch, migration_name)
  const pr_url = await createPr(branch, migration_name, diff_sql)
  console.log("PR:", pr_url)

  const summary = diff_sql.length > 500 ? diff_sql.slice(0, 500) + "\n..." : diff_sql
  await notifyFeishu("🔄 DB Schema Diff (" + ENV + ") - 需要 Review", [
    "PR: " + pr_url, "",
    "Diff SQL:", summary, "",
    "Review 并 merge PR 后，点击下方链接选择 env=" + ENV + " 执行上线：",
    "db_apply Action: " + DB_APPLY_ACTION_URL,
  ])
}

await main()
process.exit()
