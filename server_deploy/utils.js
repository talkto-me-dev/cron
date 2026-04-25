export const SUBS = ["lib", "srv", "conf"]

export const targetBranch = (sub) => (sub === "srv" ? "deploy" : "dev")

export const subDir = (env, sub) => "/root/site/talkto.me/" + env + "/" + sub

export const healthUrl = (env) =>
  env === "alpha" ? "https://api.018007.xyz/" : "https://api.talkto.me/"

export const fmtHashes = (old_h, new_h) =>
  SUBS.map((s) => s + ": " + old_h[s].slice(0, 7) + " -> " + new_h[s].slice(0, 7)).join("\n")

// 根据 backend / frontend 结果选通知文案，返回 [title, lines]
export const pickNotification = (backend_result, frontend_result, env, old_h, new_h) => {
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
    if (old_h && new_h) lines.push("三仓 hash:", fmtHashes(old_h, new_h))
    return ["⚠️ 前端失败 (" + env + ")", lines]
  }
  return [
    "✅ 部署完成 (" + env + ")",
    ["三仓 hash 变更：", fmtHashes(old_h, new_h)],
  ]
}
