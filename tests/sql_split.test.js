import { test, expect } from "vitest"
import sqlSplit from "../db_reset_alpha/sql_split.js"

test("普通多语句按分号拆分", () => {
  expect(sqlSplit("CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);")).toEqual([
    "CREATE TABLE a (id INT)",
    "CREATE TABLE b (id INT)",
  ])
})

test("单引号字符串内的分号不拆分", () => {
  const sql =
    "CREATE TABLE t (c varbinary(64) COMMENT '仅 web 流用; 一期明文');\nSELECT 1;"
  expect(sqlSplit(sql)).toEqual([
    "CREATE TABLE t (c varbinary(64) COMMENT '仅 web 流用; 一期明文')",
    "SELECT 1",
  ])
})

test("双引号与反引号内的分号不拆分", () => {
  expect(sqlSplit('SELECT "a;b", `c;d` FROM t;')).toEqual(['SELECT "a;b", `c;d` FROM t'])
})

test("双写引号转义", () => {
  expect(sqlSplit("SELECT 'it''s; ok';")).toEqual(["SELECT 'it''s; ok'"])
})

test("反斜杠转义引号", () => {
  expect(sqlSplit("SELECT 'a\\'; b';")).toEqual(["SELECT 'a\\'; b'"])
})

test("剔除 -- 行注释与 /* */ 块注释", () => {
  const sql = "-- 头注释\nSELECT 1; /* 块\n注释 */ SELECT 2; -- 尾注释"
  expect(sqlSplit(sql)).toEqual(["SELECT 1", "SELECT 2"])
})

test("字符串内的注释标记不被剔除", () => {
  expect(sqlSplit("SELECT 'a -- b', 'c /* d */';")).toEqual([
    "SELECT 'a -- b', 'c /* d */'",
  ])
})

test("末尾无分号的语句也保留", () => {
  expect(sqlSplit("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1", "SELECT 2"])
})

test("空输入与纯注释返回空数组", () => {
  expect(sqlSplit("")).toEqual([])
  expect(sqlSplit("-- 只有注释\n/* 块 */")).toEqual([])
})

test("未闭合块注释丢弃到结尾", () => {
  expect(sqlSplit("SELECT 1; /* 未闭合")).toEqual(["SELECT 1"])
})
