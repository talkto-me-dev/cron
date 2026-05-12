#! /usr/bin/env bun
import { test, expect } from "vitest"
import { mkdtempSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { runRetry } from "../lib.js"

test("runRetry 一次成功直接返回 stdout", () => {
  const out = runRetry("echo", ["ok"], { delayMs: 1 })
  expect(out.trim()).toBe("ok")
})

test("runRetry 失败 N 次后成功", () => {
  const counter = join(mkdtempSync(join(tmpdir(), "rr-")), "n"),
    script = `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"; [ $n -ge 3 ]`
  runRetry("bash", ["-c", script], { tries: 5, delayMs: 1 })
  expect(readFileSync(counter, "utf-8").trim()).toBe("3")
})

test("runRetry 达 tries 上限抛错", () => {
  expect(() => runRetry("false", [], { tries: 2, delayMs: 1 })).toThrow(/failed/)
})

test("runRetry onRetry 按序触发 不在最后一次调用", () => {
  const calls = []
  expect(() => runRetry("false", [], {
    tries: 3, delayMs: 1,
    onRetry: (i) => calls.push(i),
  })).toThrow()
  expect(calls).toEqual([1, 2])
})

test("runRetry redact 隐藏错误信息中的密钥", () => {
  const secret = "SECRETXYZ"
  expect(() => runRetry("bash", ["-c", "echo " + secret + " >&2; exit 1"], {
    tries: 1, delayMs: 1, redact: [secret],
  })).toThrowError(/\*\*\*/)
})
