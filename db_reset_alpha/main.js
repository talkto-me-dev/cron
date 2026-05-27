#!/usr/bin/env bun

import { ssh, notifyFeishu } from "../lib.js";
import { readFileSync } from "fs";
import { join } from "path";

const main = async () => {
  const script_path = join(import.meta.dirname, "server_reset.js"),
    script_content = readFileSync(script_path, "utf8");

  ssh("c1", "cat > /root/site/talkto.me/alpha/conf/alpha/reset_alpha.js", { input: script_content });

  const output = ssh("c1", "bash -c 'cd /root/site/talkto.me/alpha/conf/alpha/ && bun reset_alpha.js'");
  console.log(output);

  ssh("c1", "rm -f /root/site/talkto.me/alpha/conf/alpha/reset_alpha.js");

  const match = output.match(/KVROCKS_DELETED_COUNT=(\d+)/),
    kvrocks_count = match ? match[1] : "?";

  await notifyFeishu("✅ Alpha 数据库与缓存重置成功", [
    "重置工作流已在 c1 服务器上成功执行完成。",
    "影响：",
    "- TiDB (ai 库已重建并导入服务器上最新的 srv/tidb.sql)",
    "- Kvrocks (talkAlpha 命名空间已清空，删除键数: " + kvrocks_count + ")",
  ]);
};

await main();
