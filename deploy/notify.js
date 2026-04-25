#!/usr/bin/env bun

import { notifyFeishu, assertEnv } from "../lib.js"
import { fmtHashes } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")
const backend_result = process.env.BACKEND_RESULT || "skipped"
const frontend_result = process.env.FRONTEND_RESULT || "skipped"

const parseJson = (s) => {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

const old_hashes = parseJson(process.env.OLD_HASHES)
const new_hashes = parseJson(process.env.NEW_HASHES)

const main = async () => {
  if (backend_result !== "success") {
    await notifyFeishu("❌ 部署失败 (" + ENV + ")", [
      "阶段：backend (" + backend_result + ")",
      "需人工排查（不会自动回滚）",
    ])
    return
  }
  if (frontend_result !== "success") {
    const lines = [
      "后端已部署，前端 " + frontend_result + "。CF Pages 历史版本手动切换。",
    ]
    if (old_hashes && new_hashes) {
      lines.push("", "三仓 hash：", fmtHashes(old_hashes, new_hashes))
    }
    await notifyFeishu("⚠️ 前端失败 (" + ENV + ")", lines)
    return
  }
  await notifyFeishu("✅ 部署完成 (" + ENV + ")", [
    "三仓 hash 变更：",
    fmtHashes(old_hashes, new_hashes),
  ])
}

await main()
process.exit()
