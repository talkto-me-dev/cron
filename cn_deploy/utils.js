export const fmtHashes = (old_h, new_h) =>
  old_h && new_h
    ? Object.keys(new_h).map((k) => k + ": " + (old_h[k] || "?") + " -> " + (new_h[k] || "?")).join("\n")
    : null

export const parseHashes = (s) => (s && s.trim().startsWith("{") ? JSON.parse(s) : null)

export const fmtDiff = (d) => {
  const real = (d || "").split("\n").filter((l) => {
    const t = l.trim()
    return t && !t.startsWith("--") && t !== "BEGIN;" && t !== "COMMIT;"
  })
  return real.length ? real.join("\n") : null
}

export const pick = (backend, frontend, old_h, new_h, diff) => {
  const hash_lines = fmtHashes(old_h, new_h),
    sql_lines = fmtDiff(diff)
  let title, lines
  if (backend !== "success") {
    title = "❌ 部署失败 (alpha_cn)"
    lines = ["阶段: backend (" + backend + ")", "需人工排查（不自动回滚）"]
  } else if (frontend !== "success") {
    title = "⚠️ 前端失败 (alpha_cn)"
    lines = ["后端已部署，前端 " + frontend + "（阿里 OSS/CDN）。CDN 历史版本可手动切。"]
  } else {
    title = "✅ 部署完成 (alpha_cn)"
    lines = ["网站: https://talkto.bio"]
  }
  if (hash_lines) lines.push("", "repo hash:", hash_lines)
  if (sql_lines) lines.push("", "mysqldef 变更:", "```\n" + sql_lines + "\n```")
  return [title, lines]
}
