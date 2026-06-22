#!/usr/bin/env bun

import { ssh, notifyFeishu } from "../lib.js"

const HOST = "cn",
  APP = "/home/talktome/site/talkto.me/alpha",
  SERVICE = "talkto-bio-alpha"

const sshLive = (cmd) => ssh(HOST, cmd, { stdio: "inherit" }),
  sshCap = (cmd) => ssh(HOST, cmd).trim(),
  remoteBash = (cmd) => "bash -c '" + cmd.replaceAll("'", "'\\''") + "'"

const main = async () => {
  sshLive(remoteBash("cd " + APP + "/docker && sudo ./reset.sh"))

  sshLive("sudo systemctl restart " + SERVICE)

  const verify = "cd " + APP + "/docker && . .env && " +
    "t=$(mariadb -h127.0.0.1 -P4000 -uroot ai -N -e 'SHOW TABLES' | wc -l) && " +
    "u=$(redis-cli -h 127.0.0.1 -p \"$R_PORT\" -a \"$R_PASSWORD\" GET uid 2>/dev/null) && " +
    "c=; for i in $(seq 1 10); do c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/ || true); case \"$c\" in 2*|3*|4*) break;; esac; sleep 3; done && " +
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
