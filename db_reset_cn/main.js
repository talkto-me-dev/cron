#!/usr/bin/env bun

// alpha_cn 数据库重置（手动兜底，破坏性）：SSH 进境内机跑 docker/reset.sh
// （还原 tidb.sql + DROP/建 ai + 灌 schema + 清 kvrocks + 重起容器 + 种 uid=9999999 + 重灌 passport）
// → 重启后端重连 → 验证表数/uid/探活 → 飞书报告。比 global db_reset_alpha 更省（reset.sh 已含 passport）。

import { ssh, notifyFeishu } from "../lib.js"

const HOST = "cn",
  APP = "/home/talktome/site/talkto.me/alpha",
  SERVICE = "talkto-bio-alpha"

const sshLive = (cmd) => ssh(HOST, cmd, { stdio: "inherit" }),
  sshCap = (cmd) => ssh(HOST, cmd).trim(),
  remoteBash = (cmd) => "bash -c '" + cmd.replaceAll("'", "'\\''") + "'"

const main = async () => {
  // 1. reset.sh（耗时：down/up 容器 + 等 kvrocks 60s + 灌 passport）
  sshLive(remoteBash("cd " + APP + "/docker && sudo ./reset.sh"))

  // 2. 后端重连重建后的 kvrocks/tidb（必须，否则 ioredis "Connection is closed"）
  sshLive("sudo systemctl restart " + SERVICE)

  // 3. 验证（在服务器 bash 内 source .env 取 kvrocks 端口/密码）
  const verify = "cd " + APP + "/docker && . .env && " +
    "t=$(mariadb -h127.0.0.1 -P4000 -uroot ai -N -e 'SHOW TABLES' | wc -l) && " +
    "u=$(redis-cli -h127.0.0.1 -p \"$R_PORT\" -a \"$R_PASSWORD\" GET uid 2>/dev/null) && " +
    "c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/ || true) && " +
    "echo RESULT TABLES=$t UID=$u PROBE=$c"
  const out = sshCap(remoteBash(verify))
  console.log(out)

  const line = out.split("\n").find((l) => l.includes("TABLES=")) || "",
    kv = Object.fromEntries(line.split(/\s+/).filter((p) => p.includes("=")).map((p) => p.split("="))),
    ok = Number(kv.TABLES) > 10 && kv.UID === "9999999" && /^[234]/.test(kv.PROBE || "")

  await notifyFeishu(
    (ok ? "✅" : "❌") + " 数据库重置 (alpha_cn)",
    ok
      ? ["库已重建：表数 " + kv.TABLES + "，uid=" + kv.UID + "，后端探活 " + kv.PROBE, "kvrocks 已清空、passport 已重灌"]
      : ["重置后校验异常：", out, "需人工排查"],
  )
  if (!ok) throw new Error("reset verify failed: " + out)
}

await main()
