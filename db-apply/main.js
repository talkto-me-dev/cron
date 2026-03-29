#!/usr/bin/env bun

import { spawnSync } from "child_process";
import TIDB from "../conf/TIDB.js";
import GITCODE_TOKEN from "../conf/GITCODE_TOKEN.js";
import FEISHU_WEBHOOK from "../conf/FEISHU_WEBHOOK.js";

const SRV_REPO = "myaier/srv",
  TARGET_BRANCH = "dev",
  DB_DIFF_ACTION_URL =
    "https://github.com/talkto-me-dev/cron/actions/workflows/db-diff.yml";

const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8", stdio: "inherit", ...opts });
  if (r.status !== 0)
    throw new Error(`${cmd} failed (exit ${r.status})`);
};

const notifyFeishu = async (title, lines) => {
  const text = `${title}\n\n${lines.join("\n")}`;
  await fetch(FEISHU_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });
};

const buildDatabaseUrl = () => {
  const { username, password, hostname, port, database, tls } = TIDB;
  const params = tls ? "?tls=true" : "";
  return `mysql://${username}:${password}@${hostname}:${port}/${database}${params}`;
};

const main = async () => {
  const url = `https://oauth2:${GITCODE_TOKEN}@gitcode.com/${SRV_REPO}.git`;
  run("git", ["clone", "--depth=1", "-b", TARGET_BRANCH, url, "srv"]);

  const database_url = buildDatabaseUrl();
  console.log("applying migrations...");

  run("dbmate", ["--wait", "--migrations-dir", "srv/migration/sql", "up"], {
    env: { ...process.env, DATABASE_URL: database_url },
    stdio: "inherit",
  });

  console.log("migrations applied");

  run("dbmate", ["--migrations-dir", "srv/migration/sql", "status"], {
    env: { ...process.env, DATABASE_URL: database_url },
    stdio: "inherit",
  });

  await notifyFeishu("✅ DB Migration 上线完成", [
    "所有未应用的 migration 已执行成功。",
    "",
    `db-diff Action: ${DB_DIFF_ACTION_URL}`,
  ]);
};

await main();
process.exit();
