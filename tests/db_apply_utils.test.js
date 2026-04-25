import { test, expect } from "vitest"
import { buildDatabaseUrl } from "../db_apply/utils.js"

test("buildDatabaseUrl 基础格式 mysql://user:pwd@host:port/db", () => {
  expect(
    buildDatabaseUrl({
      username: "u",
      password: "p",
      hostname: "h",
      port: 3306,
      database: "ai",
    }),
  ).toBe("mysql://u:p@h:3306/ai")
})

test("buildDatabaseUrl tls=true 追加 ?tls=true", () => {
  expect(
    buildDatabaseUrl({
      username: "u",
      password: "p",
      hostname: "h",
      port: 4000,
      database: "ai",
      tls: true,
    }),
  ).toBe("mysql://u:p@h:4000/ai?tls=true")
})

test("buildDatabaseUrl tls=false 不追加", () => {
  expect(
    buildDatabaseUrl({
      username: "u",
      password: "p",
      hostname: "h",
      port: 3306,
      database: "ai",
      tls: false,
    }),
  ).toBe("mysql://u:p@h:3306/ai")
})

test("buildDatabaseUrl 特殊字符密码不转义（按现实现行为，由 dbmate 解析）", () => {
  expect(
    buildDatabaseUrl({
      username: "u",
      password: "p@ss:w/d",
      hostname: "h",
      port: 3306,
      database: "ai",
    }),
  ).toBe("mysql://u:p@ss:w/d@h:3306/ai")
})
