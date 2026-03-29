#! /usr/bin/env bun
import { test, expect, beforeAll, afterAll } from "vitest"
import { migrationName, schemaDiff } from "../db_diff/utils.js"
import { writeFileSync, unlinkSync } from "fs"

test("migrationName generates correct filenames", () => {
  const fixedDate = new Date("2026-03-29T04:30:40.000Z")
  const prefix = "20260329043040_"

  expect(migrationName("ALTER TABLE chat ADD COLUMN is_deleted tinyint(1);", fixedDate)).toBe(prefix + "chat.sql")
  expect(migrationName("CREATE TABLE user (id int);", fixedDate)).toBe(prefix + "user.sql")
  expect(migrationName("DROP TABLE old_logs;", fixedDate)).toBe(prefix + "old_logs.sql")
  expect(migrationName("CREATE TABLE IF NOT EXISTS chat_history (id int);", fixedDate)).toBe(prefix + "chat_history.sql")
  expect(migrationName("DROP TABLE IF EXISTS reply;", fixedDate)).toBe(prefix + "reply.sql")
  expect(migrationName("ALTER TABLE `user_info` ADD COLUMN `age` int;", fixedDate)).toBe(prefix + "user_info.sql")
  expect(migrationName("CREATE TABLE IF NOT EXISTS `payment_record` (id int);", fixedDate)).toBe(prefix + "payment_record.sql")
  expect(migrationName("CREATE TABLE db.user (id int);", fixedDate)).toBe(prefix + "user.sql")
  expect(migrationName("CREATE TABLE IF NOT EXISTS `my_db`.`orders` (id int);", fixedDate)).toBe(prefix + "orders.sql")
  expect(migrationName("ALTER TABLE chat ADD COLUMN a int;\nALTER TABLE user DROP COLUMN b;\nCREATE TABLE tag (id int);", fixedDate)).toBe(prefix + "chat_user_tag.sql")
  expect(migrationName("ALTER TABLE t1 ADD a int;\nALTER TABLE t2 ADD b int;\nALTER TABLE t3 ADD c int;\nALTER TABLE t4 ADD d int;", fixedDate)).toBe(prefix + "t1_t2_t3_etc.sql")
  expect(migrationName("ALTER TABLE chat ADD a int;\nALTER TABLE chat DROP b;", fixedDate)).toBe(prefix + "chat.sql")
  expect(migrationName("INSERT INTO user (id) VALUES (1);", fixedDate)).toBe(prefix + "schema_diff.sql")
  expect(migrationName("CREATE   TABLE \n IF \n NOT \n EXISTS \n  weird_table  (id int);", fixedDate)).toBe(prefix + "weird_table.sql")
})

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
