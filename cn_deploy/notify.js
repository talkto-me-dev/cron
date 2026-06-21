#!/usr/bin/env bun

// alpha_cn 独立飞书通知：汇总 backend/frontend 结果 + 子仓 hash 变化 + mysqldef 真实变更。
// 标题带 (alpha_cn)，与 global 各发各的、不耦合并行。复用 lib.js notifyFeishu。

import { notifyFeishu } from "../lib.js"

const ENV = "alpha_cn",
  SITE = "https://talkto.bio",
  backend = process.env.BACKEND_RESULT || "",
  frontend = process.env.FRONTEND_RESULT || ""

const hashes = (s) => (s && s.trim().startsWith("{") ? JSON.parse(s) : null)

const fmtHashes = (oldH, newH) =>
  oldH && newH
    ? Object.keys(newH).map((k) => k + ": " + (oldH[k] || "?") + " -> " + (newH[k] || "?")).join("\n")
    : null

// 去掉 dry-run 装饰与 skipped 注释，只留真实变更；无变更返回 null（卡片不展示）
const fmtDiff = (d) => {
  const real = (d || "").split("\n").filter((l) => {
    const t = l.trim()
    return t && !t.startsWith("--") && t !== "BEGIN;" && t !== "COMMIT;"
  })
  return real.length ? real.join("\n") : null
}

const main = async () => {
  const hashLines = fmtHashes(hashes(process.env.OLD_HASHES), hashes(process.env.NEW_HASHES)),
    sqlLines = fmtDiff(process.env.MYSQLDEF_DIFF)

  let title, lines
  if (backend !== "success") {
    title = "❌ 部署失败 (" + ENV + ")"
    lines = ["阶段: backend (" + backend + ")", "需人工排查（不自动回滚）"]
  } else if (frontend !== "success") {
    title = "⚠️ 前端失败 (" + ENV + ")"
    lines = ["后端已部署，前端 " + frontend + "（阿里 OSS/CDN）。CDN 历史版本可手动切。"]
  } else {
    title = "✅ 部署完成 (" + ENV + ")"
    lines = ["网站: " + SITE]
  }
  if (hashLines) lines.push("", "repo hash:", hashLines)
  if (sqlLines) lines.push("", "mysqldef 变更:", "```\n" + sqlLines + "\n```")

  await notifyFeishu(title, lines)
}

await main()
