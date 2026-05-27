#!/usr/bin/env bun

import { Redis } from "ioredis";
import { $ } from "bun";

const tidb = (await import("./TIDB.js")).default,
  kvrocks = (await import("./KVROCKS.js")).default,
  sql_file = "../../srv/tidb.sql",
  batch_size = 100,
  sql_cmd = "DROP DATABASE IF EXISTS ai; CREATE DATABASE ai CHARACTER SET binary COLLATE binary;",
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
  runTidb = async (args, file) => {
    const base = [
      "-h",
      tidb.hostname,
      "-P",
      tidb.port,
      "-u",
      tidb.username,
      "--ssl",
      ...args,
    ];
    if (file) {
      await $`mariadb ${base} < ${file}`.env({ ...process.env, MYSQL_PWD: tidb.password });
    } else {
      await $`mariadb ${base}`.env({ ...process.env, MYSQL_PWD: tidb.password });
    }
  },
  resetTidb = async () => {
    await runTidb(["-e", sql_cmd]);
    await runTidb(["ai"], sql_file);
  },
  main = async () => {
    const count = await resetKvrocks();
    await resetTidb();
    console.log("KVROCKS_DELETED_COUNT=" + count);
  };

await main();

