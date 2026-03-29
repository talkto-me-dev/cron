#! /usr/bin/env bun
import { test, expect } from "vitest"
import { migrationName } from "../db_diff/utils.js"

test("migrationName generates correct filenames", () => {
  const fixedDate = new Date("2026-03-29T04:30:40.000Z")
  const prefix = "20260329043040_"

  // 1. Basic ALTER
  expect(migrationName("ALTER TABLE chat ADD COLUMN is_deleted tinyint(1);", fixedDate))
    .toBe(prefix + "chat.sql")

  // 2. Basic CREATE
  expect(migrationName("CREATE TABLE user (id int);", fixedDate))
    .toBe(prefix + "user.sql")

  // 3. Basic DROP
  expect(migrationName("DROP TABLE old_logs;", fixedDate))
    .toBe(prefix + "old_logs.sql")

  // 4. CREATE IF NOT EXISTS (This is the specific case user mentioned it generates 'IF.sql')
  expect(migrationName("CREATE TABLE IF NOT EXISTS chat_history (id int);", fixedDate))
    .toBe(prefix + "chat_history.sql")

  // 5. DROP IF EXISTS
  expect(migrationName("DROP TABLE IF EXISTS reply;", fixedDate))
    .toBe(prefix + "reply.sql")

  // 6. With backticks
  expect(migrationName("ALTER TABLE `user_info` ADD COLUMN `age` int;", fixedDate))
    .toBe(prefix + "user_info.sql")

  // 7. With backticks and IF NOT EXISTS
  expect(migrationName("CREATE TABLE IF NOT EXISTS `payment_record` (id int);", fixedDate))
    .toBe(prefix + "payment_record.sql")

  // 8. With database name prefix
  expect(migrationName("CREATE TABLE db.user (id int);", fixedDate))
    .toBe(prefix + "user.sql")

  // 9. With database name prefix and backticks
  expect(migrationName("CREATE TABLE IF NOT EXISTS `my_db`.`orders` (id int);", fixedDate))
    .toBe(prefix + "orders.sql")

  // 10. Multiple tables (1-3)
  expect(migrationName("ALTER TABLE chat ADD COLUMN a int;\nALTER TABLE user DROP COLUMN b;\nCREATE TABLE tag (id int);", fixedDate))
    .toBe(prefix + "chat_user_tag.sql")

  // 11. Multiple tables (4+)
  expect(migrationName(`
    ALTER TABLE t1 ADD a int;
    ALTER TABLE t2 ADD b int;
    ALTER TABLE t3 ADD c int;
    ALTER TABLE t4 ADD d int;
  `, fixedDate))
    .toBe(prefix + "t1_t2_t3_etc.sql")

  // 12. Multiple statements same table (should deduplicate)
  expect(migrationName(`
    ALTER TABLE chat ADD a int;
    ALTER TABLE chat DROP b;
  `, fixedDate))
    .toBe(prefix + "chat.sql")

  // 13. Unparsable fallback
  expect(migrationName("INSERT INTO user (id) VALUES (1);", fixedDate))
    .toBe(prefix + "schema_diff.sql")

  // 14. Extra spaces and line breaks
  expect(migrationName("CREATE   TABLE \n IF \n NOT \n EXISTS \n  weird_table  (id int);", fixedDate))
    .toBe(prefix + "weird_table.sql")
})
