#!/usr/bin/env bun

import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import TIDB from "../conf/TIDB.js";
import GITCODE_TOKEN from "../conf/GITCODE_TOKEN.js";
import FEISHU_WEBHOOK from "../conf/FEISHU_WEBHOOK.js";

const SRV_REPO = "myaier/srv",
  GITCODE_API = "https://api.gitcode.com/api/v5",
  TARGET_BRANCH = "dev",
  DB_DIFF_ACTION_URL =
    "https://github.com/talkto-me-dev/cron/actions/workflows/db-diff.yml",
  DB_APPLY_ACTION_URL =
    "https://github.com/talkto-me-dev/cron/actions/workflows/db-apply.yml";

const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (r.status !== 0)
    throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
};

const notifyFeishu = async (title, lines) => {
  const text = `${title}\n\n${lines.join("\n")}`;
  await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });
};

const stripNonTableDdl = (sql) =>
  sql
    .split("\n")
    .filter(
      (l) =>
        !/^\s*(CREATE\s+DATABASE|USE\s+|DROP\s+DATABASE)/i.test(l)
    )
    .join("\n");

const cloneSrv = () => {
  const url = `https://oauth2:${GITCODE_TOKEN}@gitcode.com/${SRV_REPO}.git`;
  run("git", ["clone", "--depth=1", "-b", TARGET_BRANCH, url, "srv"]);
};

const dumpOnlineSchema = () => {
  const args = [
    "--no-data",
    "--skip-comments",
    "--compact",
    "--ssl",
    `--ignore-table=${TIDB.database}.schema_migrations`,
    `-h${TIDB.hostname}`,
    `-P${TIDB.port}`,
    `-u${TIDB.username}`,
    `-p${TIDB.password}`,
    TIDB.database,
  ];
  return run("mysqldump", args);
};

const schemaDiff = (online_file, desired_file) => {
  const r = spawnSync("mysqldef", ["--file", desired_file, online_file], {
    encoding: "utf-8",
  });
  return (r.stdout || "").trim();
};

const parseDiffSql = (raw) =>
  raw
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !l.startsWith("-- ") &&
        l !== "BEGIN;" &&
        l !== "COMMIT;"
    )
    .join("\n")
    .trim();

const genMigrationFile = (diff_sql) => {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const name = `${ts}_auto_schema_diff.sql`,
    content = `-- migrate:up\n${diff_sql}\n\n-- migrate:down\n`,
    path = `srv/migration/sql/${name}`;
  writeFileSync(path, content);
  return { name, path };
};

const pushBranch = (branch, migration_name) => {
  const git = (...args) => run("git", args, { cwd: "srv" });
  git("checkout", "-b", branch);
  git("add", "migration/sql/");
  git("commit", `-mauto: ${migration_name}`);
  git("push", "origin", branch);
};

const createPr = async (branch, migration_name, diff_sql) => {
  const body = `自动生成的 schema diff migration\n\n\`\`\`sql\n${diff_sql}\n\`\`\``;
  const resp = await fetch(`${GITCODE_API}/repos/${SRV_REPO}/pulls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": GITCODE_TOKEN,
    },
    body: JSON.stringify({
      title: `auto: ${migration_name}`,
      head: branch,
      base: TARGET_BRANCH,
      body,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`gitcode API: ${JSON.stringify(data)}`);
  return data.html_url || data.web_url || data._links?.html?.href;
};

const main = async () => {
  cloneSrv();

  const online_raw = dumpOnlineSchema(),
    online_clean = stripNonTableDdl(online_raw);
  writeFileSync("online_schema.sql", online_clean);

  const desired_file = "srv/tidb.sql";
  if (!existsSync(desired_file))
    throw new Error("srv/tidb.sql not found");

  const desired_clean = stripNonTableDdl(readFileSync(desired_file, "utf-8"));
  writeFileSync("desired_schema.sql", desired_clean);

  const raw_diff = schemaDiff("online_schema.sql", "desired_schema.sql"),
    diff_sql = parseDiffSql(raw_diff);

  if (!diff_sql || raw_diff.includes("Nothing is modified")) {
    console.log("schema 无差异");
    await notifyFeishu("✅ DB Schema Diff", [
      "线上 schema 与 tidb.sql 一致，无需迁移。",
      "",
      `db-diff Action: ${DB_DIFF_ACTION_URL}`,
    ]);
    return;
  }

  console.log("diff SQL:\n", diff_sql);

  const { name: migration_name } = genMigrationFile(diff_sql),
    ts = migration_name.slice(0, 8),
    branch = `auto/db-diff-${ts}`;

  pushBranch(branch, migration_name);
  const pr_url = await createPr(branch, migration_name, diff_sql);

  console.log("PR:", pr_url);

  const summary =
    diff_sql.length > 500 ? diff_sql.slice(0, 500) + "\n..." : diff_sql;

  await notifyFeishu("🔄 DB Schema Diff - 需要 Review", [
    `PR: ${pr_url}`,
    "",
    "Diff SQL:",
    summary,
    "",
    "Review 并 merge PR 后，点击下方链接执行上线：",
    `db-apply Action: ${DB_APPLY_ACTION_URL}`,
  ]);
};

await main();
process.exit();
