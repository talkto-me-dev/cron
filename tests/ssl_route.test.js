import { test, expect } from "vitest"
import route from "../ssl/route.js"

const HOSTS = ["c1", "c2", "c3", "cn"]

test("显式映射的域只推到指定 host", () => {
  const r = route({ "talkto.bio": ["cn"] }, HOSTS)
  expect(r("talkto.bio")).toEqual(["cn"])
})

test("被占用的 host 不进默认集合（cn 不混入 global）", () => {
  const r = route({ "talkto.bio": ["cn"] }, HOSTS)
  expect(r("talkto.me")).toEqual(["c1", "c2", "c3"])
  expect(r("018007.xyz")).toEqual(["c1", "c2", "c3"])
  expect(r("talkto.me")).not.toContain("cn")
})

test("无任何映射时默认推全部 host（保持原行为）", () => {
  const r = route({}, HOSTS)
  expect(r("talkto.me")).toEqual(HOSTS)
})

test("多域共占一个 host 也只占一次", () => {
  const r = route({ "a.com": ["cn"], "b.com": ["cn"] }, HOSTS)
  expect(r("a.com")).toEqual(["cn"])
  expect(r("c.com")).toEqual(["c1", "c2", "c3"])
})
