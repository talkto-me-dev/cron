#!/usr/bin/env bun

import { ssh, notifyFeishu, cloneSrvFromGithub, dbBranch } from "../lib.js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const main = async () => {
  const env = "alpha",
    db_branch = dbBranch(env);

  cloneSrvFromGithub(db_branch, "srv-db");

  const srv_db_dir = join(process.cwd(), "srv-db"),
    migration_dir = join(srv_db_dir, "migration/sql"),
    files = readdirSync(migration_dir),
    versions = files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.split("_")[0]),
    sql_content = readFileSync(join(srv_db_dir, "tidb.sql"), "utf8");

  const script_path = join(import.meta.dirname, "server_reset.js"),
    script_content = readFileSync(script_path, "utf8"),
    final_script = script_content.replace(
      "versions_placeholder = []",
      `versions_placeholder = ${JSON.stringify(versions)}`
    );

  ssh("c1", "cat > /root/site/talkto.me/alpha/conf/alpha/reset_tidb.sql", { input: sql_content });
  ssh("c1", "cat > /root/site/talkto.me/alpha/conf/alpha/reset_alpha.js", { input: final_script });

  const output = ssh("c1", "bash -c 'cd /root/site/talkto.me/alpha/conf/alpha/ && bun reset_alpha.js'");
  console.log(output);

  ssh("c1", "rm -f /root/site/talkto.me/alpha/conf/alpha/reset_alpha.js /root/site/talkto.me/alpha/conf/alpha/reset_tidb.sql");

  const match = output.match(/KVROCKS_DELETED_COUNT=(\d+)/),
    kvrocks_count = match ? match[1] : "?";

  await notifyFeishu("✅ Alpha 数据库与缓存重置成功", [
    "重置工作流已在 c1 服务器上成功执行完成。",
    "影响：",
    "- TiDB (ai 库已重建并导入 " + db_branch + " 分支的 tidb.sql)",
    "- Kvrocks (talkAlpha 命名空间已清空，删除键数: " + kvrocks_count + ")",
  ]);
};

await main();
