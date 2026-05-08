import { resolve } from "path"
import { pathToFileURL } from "url"

export const SUBS = ["lib", "srv", "conf", "ai"]

export const targetBranch = (sub) => (sub === "srv" ? "deploy" : sub === "ai" ? "main" : "dev")

export const subDir = (env, sub) => "/root/site/talkto.me/" + env + "/" + sub

export const loadSiteConf = async (env) => {
  const { cloneIConf } = await import("../lib.js")
  cloneIConf()
  const dir = resolve(process.cwd(), "iconf", env),
    { MAIN_HOST } = await import(pathToFileURL(resolve(dir, "SITE.js")).href),
    api = (await import(pathToFileURL(resolve(dir, "API.js")).href)).default
  return { main_host: MAIN_HOST, api_url: "https:" + api }
}

export const fmtHashes = (old_h, new_h) =>
  SUBS.map((s) => {
    const o = (old_h?.[s] || "").slice(0, 7) || "?",
      n = (new_h?.[s] || "").slice(0, 7) || "?"
    return s + ": " + o + " -> " + n
  }).join("\n")

export const pickNotification = (backend_result, frontend_result, env, old_h, new_h, site_url) => {
  if (backend_result !== "success") {
    return [
      "❌ 部署失败 (" + env + ")",
      [
        "阶段：backend (" + backend_result + ")",
        "需人工排查（不会自动回滚）",
      ],
    ]
  }
  if (frontend_result !== "success") {
    const lines = [
      "后端已部署，前端 " + frontend_result + "。CF Pages 历史版本手动切换。",
    ]
    if (old_h && new_h) lines.push("repo hash:", fmtHashes(old_h, new_h))
    return ["⚠️ 前端失败 (" + env + ")", lines]
  }
  const lines = []
  lines.push("repo hash:", fmtHashes(old_h, new_h))
  if (site_url) lines.push("网站: " + site_url)
  return [
    "✅ 部署完成 (" + env + ")",
    lines,
  ]
}
