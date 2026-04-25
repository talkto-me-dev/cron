#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs"
import {
  run,
  notifyFeishu,
  cloneSrvGithub,
  cloneIConf,
  tidbConf,
  assertEnv,
  dbBranch,
  dispatchWorkflow,
  GITCODE_TOKEN,
  SRV_REPO,
  SRV_GITHUB_REPO,
  DEPLOY_PIPELINE_ACTION_URL,
} from "../lib.js"
import { schemaDiff, migrationName, stripNonTableDdl } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const dumpOnlineSchema = (tidb) =>
  run(
    "mysqldump",
    [
      "--no-data", "--skip-comments", "--compact", "--ssl-mode=REQUIRED",
      "--ignore-table=" + tidb.database + ".schema_migrations",
      "-h" + tidb.hostname, "-P" + tidb.port,
      "-u" + tidb.username,
      tidb.database,
    ],
    { env: { ...process.env, MYSQL_PWD: tidb.password } },
  )

const sync = () => {
  cloneSrvGithub("dev", "srv")
  const git = (...args) => run("git", args, { cwd: "srv", redact: [GITCODE_TOKEN] })
  const gitcode_url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + SRV_REPO + ".git"
  git("remote", "add", "gitcode", gitcode_url)
  git("fetch", "gitcode", "dev")
  git("push", "origin", "+gitcode/dev:dev")
  git("push", "origin", "+gitcode/dev:deploy")
  git("push", "gitcode", "+gitcode/dev:deploy")
  git("reset", "--hard", "gitcode/dev")
}

const closeOpenPr = () => {
  const out = run("gh", [
    "pr", "list",
    "--repo", SRV_GITHUB_REPO,
    "--base", dbBranch(ENV),
    "--state", "open",
    "--json", "number",
  ])
  for (const pr of JSON.parse(out || "[]")) {
    run("gh", [
      "pr", "close", String(pr.number),
      "--repo", SRV_GITHUB_REPO,
      "--delete-branch",
    ], { stdio: "inherit" })
  }
}

const writeMigration = (diff_sql) => {
  const name = migrationName(diff_sql)
  writeFileSync(
    "srv-db/migration/sql/" + name,
    "-- migrate:up\n" + diff_sql + "\n\n-- migrate:down\n",
  )
  return name
}

const pushAutoBranch = (branch, name) => {
  const git = (...args) => run("git", args, { cwd: "srv-db" })
  git("checkout", "-b", branch)
  git("add", "migration/sql/")
  git("commit", "-mauto(" + ENV + "): " + name)
  git("push", "origin", branch)
}

const createPr = (branch, name, diff_sql) => {
  const body =
    "自动生成的 schema diff migration (env=" + ENV + ")\n\n```sql\n" + diff_sql + "\n```"
  return run("gh", [
    "pr", "create",
    "--repo", SRV_GITHUB_REPO,
    "--base", dbBranch(ENV),
    "--head", branch,
    "--title", "auto(" + ENV + "): " + name,
    "--body", body,
  ]).trim()
}

const main = async () => {
  sync()

  cloneSrvGithub(dbBranch(ENV), "srv-db")
  cloneIConf()

  const tidb = await tidbConf(ENV)

  let online_clean
  try {
    online_clean = stripNonTableDdl(dumpOnlineSchema(tidb))
  } catch (e) {
    await notifyFeishu("❌ mysqldump 失败 (" + ENV + ")", [
      e.message,
      "",
      DEPLOY_PIPELINE_ACTION_URL,
    ])
    throw e
  }
  writeFileSync("online_schema.sql", online_clean)

  const desired_file = "srv/tidb.sql"
  if (!existsSync(desired_file)) throw new Error("srv/tidb.sql not found")
  writeFileSync(
    "desired_schema.sql",
    stripNonTableDdl(readFileSync(desired_file, "utf-8")),
  )

  let diff_sql
  try {
    diff_sql = schemaDiff("online_schema.sql", "desired_schema.sql")
  } catch (e) {
    await notifyFeishu("❌ mysqldef 失败 (" + ENV + ")", [
      e.message,
      "",
      DEPLOY_PIPELINE_ACTION_URL,
    ])
    throw e
  }

  if (!diff_sql) {
    console.log("schema 无差异，dispatch deploy")
    dispatchWorkflow("deploy.yml", { env: ENV })
    await notifyFeishu("ℹ️ 无 SQL 变更，开始部署 (" + ENV + ")", [
      "schema 一致，已触发 deploy。",
    ])
    return
  }

  console.log("diff SQL:\n", diff_sql)

  closeOpenPr()

  const name = migrationName(diff_sql),
    branch = "auto/db_diff-" + ENV + "-" + name.slice(0, 14)
  writeMigration(diff_sql)
  pushAutoBranch(branch, name)
  const pr_url = createPr(branch, name, diff_sql)
  console.log("PR:", pr_url)

  const summary = diff_sql.length > 500 ? diff_sql.slice(0, 500) + "\n..." : diff_sql
  await notifyFeishu("📋 DB Migration PR 就绪 (" + ENV + ")", [
    "PR: " + pr_url,
    "",
    "Diff SQL:",
    summary,
    "",
    "Review 并 merge PR 后，relay 自动触发 db_apply。",
  ])
}

await main()
process.exit()
