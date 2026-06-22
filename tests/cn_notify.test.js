#!/usr/bin/env bun

import { test, expect } from "vitest"
import { pick, fmtDiff, fmtHashes, parseHashes } from "../cn_deploy/utils.js"

const OLD = { srv: "aaaaaaa", site: "bbbbbbb" },
  NEW = { srv: "ccccccc", site: "ddddddd" }

test("全成功 → ✅ 部署完成 (alpha_cn) + hash", () => {
  const [title, lines] = pick("success", "success", OLD, NEW, "")
  expect(title).toBe("✅ 部署完成 (alpha_cn)")
  expect(lines).toEqual([
    "网站: https://talkto.bio",
    "",
    "repo hash:",
    "srv: aaaaaaa -> ccccccc\nsite: bbbbbbb -> ddddddd",
  ])
})

test("backend 失败 → ❌ 部署失败", () => {
  const [title, lines] = pick("failure", "skipped", null, null, "")
  expect(title).toBe("❌ 部署失败 (alpha_cn)")
  expect(lines).toEqual(["阶段: backend (failure)", "需人工排查（不自动回滚）"])
})

test("backend 成功 + frontend 失败 → ⚠️ 前端失败", () => {
  const [title] = pick("success", "failure", null, null, "")
  expect(title).toBe("⚠️ 前端失败 (alpha_cn)")
})

test("fmtDiff: 仅 skipped/BEGIN/COMMIT 的 no-op diff → null", () => {
  expect(fmtDiff("-- dry run --\nBEGIN;\n-- Skipped: DROP TABLE `x`;\nCOMMIT;")).toBeNull()
  expect(fmtDiff("")).toBeNull()
})

test("fmtDiff: 真实 ALTER → 只留变更行", () => {
  expect(fmtDiff("-- dry run --\nBEGIN;\nALTER TABLE `chat` ADD COLUMN `x` int;\nCOMMIT;")).toBe(
    "ALTER TABLE `chat` ADD COLUMN `x` int;",
  )
})

test("有真实 mysqldef 变更 → 卡片含 fenced 变更段", () => {
  const [, lines] = pick("success", "success", null, null, "BEGIN;\nALTER TABLE `chat` ADD COLUMN `x` int;\nCOMMIT;")
  expect(lines).toContain("mysqldef 变更:")
  expect(lines.some((l) => l.includes("ALTER TABLE `chat`"))).toBe(true)
})

test("fmtHashes: 缺一边 → null", () => {
  expect(fmtHashes(null, NEW)).toBeNull()
  expect(fmtHashes(OLD, null)).toBeNull()
})

test("parseHashes: 非 JSON / 空 → null，合法 JSON → 对象", () => {
  expect(parseHashes("")).toBeNull()
  expect(parseHashes(undefined)).toBeNull()
  expect(parseHashes('{"srv":"abc"}')).toEqual({ srv: "abc" })
})
