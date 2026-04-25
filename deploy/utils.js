export const SUBS = ["lib", "srv", "conf"]

export const targetBranch = (sub) => (sub === "srv" ? "deploy" : "dev")

export const subDir = (env, sub) => "/root/site/talkto.me/" + env + "/" + sub

export const healthUrl = (env) =>
  env === "alpha" ? "https://api.018007.xyz/" : "https://api.talkto.me/"

export const fmtHashes = (old_h, new_h) =>
  SUBS.map((s) => s + ": " + old_h[s].slice(0, 7) + " -> " + new_h[s].slice(0, 7)).join("\n")
