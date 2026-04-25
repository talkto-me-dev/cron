#! /usr/bin/env bun
import { test, expect, beforeAll, afterAll } from "vitest"
import { schemaDiff } from "../deploy_pipeline/utils.js"
import { writeFileSync, unlinkSync } from "fs"

beforeAll(() => {
  writeFileSync("__test_online.sql", "")
  writeFileSync("__test_desired.sql", "")
})

afterAll(() => {
  try { unlinkSync("__test_online.sql") } catch (e) {}
  try { unlinkSync("__test_desired.sql") } catch (e) {}
})

test("schemaDiff outputs empty for identical schemas", () => {
  writeFileSync("__test_online.sql", "CREATE TABLE a (id int);")
  writeFileSync("__test_desired.sql", "CREATE TABLE a (id int);")
  expect(schemaDiff("__test_online.sql", "__test_desired.sql")).toBe("")
})

test("schemaDiff outputs DROP TABLE when target table missing in desired", () => {
  writeFileSync("__test_online.sql", "CREATE TABLE a (id int);\nCREATE TABLE b (id int);")
  writeFileSync("__test_desired.sql", "CREATE TABLE a (id int);")
  expect(schemaDiff("__test_online.sql", "__test_desired.sql")).toBe("DROP TABLE `b`;")
})

test("schemaDiff outputs DROP COLUMN when target column missing in desired", () => {
  writeFileSync("__test_online.sql", "CREATE TABLE a (id int, name varchar(20));")
  writeFileSync("__test_desired.sql", "CREATE TABLE a (id int);")
  expect(schemaDiff("__test_online.sql", "__test_desired.sql")).toBe("ALTER TABLE `a` DROP COLUMN `name`;")
})

test("schemaDiff outputs ADD COLUMN when new column added to desired", () => {
  writeFileSync("__test_online.sql", "CREATE TABLE a (id int);")
  writeFileSync("__test_desired.sql", "CREATE TABLE a (id int, age int);")
  expect(schemaDiff("__test_online.sql", "__test_desired.sql")).toBe("ALTER TABLE `a` ADD COLUMN `age` int AFTER `id`;")
})
