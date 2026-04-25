import { test, expect } from "vitest"
import { pickNotification } from "../server_deploy/utils.js"

const HASHES_OLD = { lib: "aaaaaaaaaaaa", srv: "bbbbbbbbbbbb", conf: "cccccccccccc" }
const HASHES_NEW = { lib: "ddddddddddd1", srv: "ddddddddddd2", conf: "ddddddddddd3" }

test("backend & frontend 全成功 → ✅ 部署完成", () => {
  const [title, lines] = pickNotification("success", "success", "alpha", HASHES_OLD, HASHES_NEW)
  expect(title).toBe("✅ 部署完成 (alpha)")
  expect(lines).toEqual([
    "三仓 hash 变更：",
    "lib: aaaaaaa -> ddddddd\nsrv: bbbbbbb -> ddddddd\nconf: ccccccc -> ddddddd",
  ])
})

test("backend 失败 → ❌ 部署失败 (含失败状态)", () => {
  const [title, lines] = pickNotification("failure", "skipped", "alpha", null, null)
  expect(title).toBe("❌ 部署失败 (alpha)")
  expect(lines).toEqual([
    "阶段：backend (failure)",
    "需人工排查（不会自动回滚）",
  ])
})

test("backend 成功 + frontend 失败 → ⚠️ 前端失败 (含 hash diff)", () => {
  const [title, lines] = pickNotification("success", "failure", "prod", HASHES_OLD, HASHES_NEW)
  expect(title).toBe("⚠️ 前端失败 (prod)")
  expect(lines).toEqual([
    "后端已部署，前端 failure。CF Pages 历史版本手动切换。",
    "三仓 hash:",
    "lib: aaaaaaa -> ddddddd\nsrv: bbbbbbb -> ddddddd\nconf: ccccccc -> ddddddd",
  ])
})

test("backend 成功 + frontend 失败 + hash 缺失 → 不输出 hash 段", () => {
  const [title, lines] = pickNotification("success", "failure", "prod", null, null)
  expect(title).toBe("⚠️ 前端失败 (prod)")
  expect(lines).toEqual([
    "后端已部署，前端 failure。CF Pages 历史版本手动切换。",
  ])
})

test("backend cancelled → 也走部署失败分支", () => {
  const [title] = pickNotification("cancelled", "skipped", "alpha", null, null)
  expect(title).toBe("❌ 部署失败 (alpha)")
})
