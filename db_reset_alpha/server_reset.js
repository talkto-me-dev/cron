#!/usr/bin/env bun

import { Redis } from "ioredis";
import { readdirSync, readFileSync } from "fs";
import { SQL } from "bun";

const tidb = (await import("./TIDB.js")).default,
  kvrocks = (await import("./KVROCKS.js")).default,
  sql_file = "../../srv/tidb.sql",
  batch_size = 100,
  resetKvrocks = async () => {
    const client = new Redis(kvrocks);
    let cur = "0",
      count = 0,
      pipe = client.pipeline(),
      pipe_size = 0;

    do {
      const [next, keys] = await client.scan(cur, "COUNT", batch_size);
      cur = next;
      if (keys.length > 0) {
        pipe.unlink(keys);
        count += keys.length;
        pipe_size += 1;
        if (pipe_size >= 10) {
          await pipe.exec();
          pipe = client.pipeline();
          pipe_size = 0;
        }
      }
    } while (cur !== "0");

    if (pipe_size > 0) {
      await pipe.exec();
    }
    await client.quit();
    return count;
  },
  resetTidb = async () => {
    const db = new SQL(tidb);
    await db.unsafe("SET FOREIGN_KEY_CHECKS = 0");

    const tables = await db.unsafe("SHOW TABLES");
    for (const row of tables) {
      await db.unsafe(`DROP TABLE IF EXISTS ${Object.values(row)[0]}`);
    }

    await db.unsafe("SET FOREIGN_KEY_CHECKS = 1");

    const sql = readFileSync(sql_file, "utf8"),
      statements = sql
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(";")
        .map((s) => s.trim())
        .filter(
          (s) =>
            s.length > 0 &&
            !s.toUpperCase().startsWith("USE") &&
            !s.toUpperCase().startsWith("CREATE DATABASE"),
        );

    for (const s of statements) {
      await db.unsafe(s);
    }

    const migration_dir = "../../srv/migration/sql",
      files = readdirSync(migration_dir),
      versions = files
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.split("_")[0]);

    if (versions.length > 0) {
      await db.unsafe("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY)");
      for (const v of versions) {
        await db.unsafe(`INSERT IGNORE INTO schema_migrations (version) VALUES ('${v}')`);
      }
    }

    await db.close();
  },
  main = async () => {
    const count = await resetKvrocks();
    await resetTidb();
    console.log("KVROCKS_DELETED_COUNT=" + count);
  };

await main();
