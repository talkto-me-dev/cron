#!/usr/bin/env bun

import { writeFileSync, readFileSync, existsSync } from "fs"
import { randomBytes } from "crypto"
import {
  run, notifyFeishu, cloneSrvFromGithub, cloneIConf, tidbConf,
  assertEnv, dbBranch, dispatchWorkflow,
  GITCODE_TOKEN, SRV_REPO, SRV_GITHUB_REPO, SERVER_DEPLOY_ACTION_URL,
} from "../lib.js"
import { schemaDiff, migrationName, stripNonTableDdl } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const tryOrNotify = async (title, fn, ...prefix) => {
  try { return await fn() }
  catch (e) {
    await notifyFeishu(title, [...prefix, e.message])
    throw e
  }
}

const dumpOnlineSchema = (tidb) =>
  run("mysqldump", [
    "--no-data", "--skip-comments", "--compact", "--ssl-mode=REQUIRED",
    "--ignore-table=" + tidb.database + ".schema_migrations",
    "-h" + tidb.hostname, "-P" + tidb.port,
    "-u" + tidb.username,
    tidb.database,
  ], { env: { ...process.env, MYSQL_PWD: tidb.password } })

const sync = () => {
  cloneSrvFromGithub("dev", "srv")
  const git = (...args) => run("git", args, { cwd: "srv", redact: [GITCODE_TOKEN] }),
    gitcode_url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + SRV_REPO + ".git"
  git("remote", "add", "gitcode", gitcode_url)
  git("fetch", "-q", "gitcode", "dev")
  git("push", "-q", "origin", "+gitcode/dev:dev")
  git("push", "-q", "origin", "+gitcode/dev:deploy")
  git("push", "-q", "gitcode", "+gitcode/dev:deploy")
  git("reset", "-q", "--hard", "gitcode/dev")
}

const closeOpenPr = () => {
  const out = run("gh", [
    "pr", "list", "--repo", SRV_GITHUB_REPO, "--base", dbBranch(ENV),
    "--state", "open", "--json", "number",
  ])
  for (const pr of JSON.parse(out || "[]")) {
    run("gh", [
      "pr", "close", String(pr.number),
      "--repo", SRV_GITHUB_REPO, "--delete-branch",
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
  git("checkout", "-q", "-b", branch)
  git("add", "migration/sql/")
  git("commit", "-q", "-mauto(" + ENV + "): " + name)
  git("push", "-q", "origin", branch)
}

const createPr = (branch, name, diff_sql) => {
  const body = "自动生成的 schema diff migration (env=" + ENV + ")\n\n```sql\n" + diff_sql + "\n```"
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
  await tryOrNotify(
    "❌ 代码同步失败 (" + ENV + ")", () => sync(),
    "deploy_pipeline 同步阶段出错，未触发后续部署。",
  )

  cloneSrvFromGithub(dbBranch(ENV), "srv-db")
  cloneIConf()

  const tidb = await tidbConf(ENV),
    online_clean = await tryOrNotify(
      "❌ mysqldump 失败 (" + ENV + ")",
      () => stripNonTableDdl(dumpOnlineSchema(tidb)),
    )
  writeFileSync("online_schema.sql", online_clean)

  const desired_file = "srv/tidb.sql"
  if (!existsSync(desired_file)) throw new Error("srv/tidb.sql not found")
  writeFileSync("desired_schema.sql", stripNonTableDdl(readFileSync(desired_file, "utf-8")))

  const diff_sql = await tryOrNotify(
    "❌ mysqldef 失败 (" + ENV + ")",
    () => schemaDiff("online_schema.sql", "desired_schema.sql"),
  )

  if (!diff_sql) {
    console.log("schema 无差异，dispatch deploy")
    dispatchWorkflow("server_deploy.yml", { env: ENV })
    await notifyFeishu("ℹ️ 无 SQL 变更，开始部署 (" + ENV + ")", [
      "schema 一致，已触发 server_deploy: " + SERVER_DEPLOY_ACTION_URL,
    ])
    return
  }

  console.log("diff SQL:\n", diff_sql)
  closeOpenPr()

  const name = migrationName(diff_sql),
    suffix = randomBytes(3).toString("hex"),
    branch = "auto/db_diff-" + ENV + "-" + name.slice(0, 14) + "-" + suffix
  writeMigration(diff_sql)
  pushAutoBranch(branch, name)
  const pr_url = createPr(branch, name, diff_sql)
  console.log("PR:", pr_url)

  const summary = diff_sql.length > 500 ? diff_sql.slice(0, 500) + "\n..." : diff_sql
  await notifyFeishu("📋 DB Migration PR 就绪 (" + ENV + ")", [
    "PR: " + pr_url,
    "合并后触发: " + SERVER_DEPLOY_ACTION_URL,
    "",
    "Diff SQL:",
    summary,
  ])
}

await main()
process.exit()
