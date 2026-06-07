import { test, expect } from "vitest"
import { stripNonTableDdl } from "../deploy_pipeline/utils.js"

test("stripNonTableDdl 删除 CREATE/DROP DATABASE 与 USE", () => {
  const sql = [
    "CREATE DATABASE foo;",
    "USE foo;",
    "DROP DATABASE old;",
    "CREATE TABLE chat (id INT);",
    "ALTER TABLE chat ADD COLUMN x INT;",
  ].join("\n")
  expect(stripNonTableDdl(sql)).toBe(
    "CREATE TABLE chat (id INT);\nALTER TABLE chat ADD COLUMN x INT;",
  )
})

test("stripNonTableDdl 兼容大小写与空格", () => {
  const sql = [
    "  create   database  foo  ;",
    "use   foo;",
    "DROP  DATABASE old;",
    "CREATE TABLE t (id INT);",
  ].join("\n")
  expect(stripNonTableDdl(sql)).toBe("CREATE TABLE t (id INT);")
})

test("stripNonTableDdl 保留正常 DDL", () => {
  const sql = "CREATE TABLE chat (id INT);\nALTER TABLE user ADD COLUMN age INT;"
  expect(stripNonTableDdl(sql)).toBe(sql)
})

test("stripNonTableDdl 不误删带 DATABASE 关键字的注释或字符串", () => {
  const sql = "CREATE TABLE t (id INT);\n-- CREATE DATABASE foo"
  expect(stripNonTableDdl(sql)).toBe(sql)
})
