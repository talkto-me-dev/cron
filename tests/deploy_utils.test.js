import { test, expect } from "vitest"
import { SUBS, targetBranch, subDir, healthUrl, fmtHashes } from "../server_deploy/utils.js"

test("SUBS lib srv conf ai 顺序固定", () => {
  expect(SUBS).toEqual(["lib", "srv", "conf", "ai"])
})

test("targetBranch srv→deploy ai→main 其余→dev", () => {
  expect(targetBranch("srv")).toBe("deploy")
  expect(targetBranch("ai")).toBe("main")
  expect(targetBranch("lib")).toBe("dev")
  expect(targetBranch("conf")).toBe("dev")
})

test("subDir 拼接 env + sub", () => {
  expect(subDir("alpha", "srv")).toBe("/root/site/talkto.me/alpha/srv")
  expect(subDir("prod", "lib")).toBe("/root/site/talkto.me/prod/lib")
})

test("healthUrl 区分 env", () => {
  expect(healthUrl("alpha")).toBe("https://api.018007.xyz/")
  expect(healthUrl("prod")).toBe("https://api.talkto.me/")
})

test("fmtHashes 短哈希 + arrow", () => {
  const old_h = {
    lib: "94ad7cfddb65b1de",
    srv: "f38d49b79dae0868",
    conf: "53a1b80e151fd9fb",
    ai: "abcdef1234567890",
  }
  const new_h = {
    lib: "abc1234deadbeef0",
    srv: "f38d49b79dae0868",
    conf: "11112222fffeeedd",
    ai: "1234567abcdef012",
  }
  expect(fmtHashes(old_h, new_h)).toBe(
    "lib: 94ad7cf -> abc1234\nsrv: f38d49b -> f38d49b\nconf: 53a1b80 -> 1111222\nai: abcdef1 -> 1234567",
  )
})
