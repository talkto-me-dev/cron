#!/usr/bin/env bun

import { notifyFeishu, assertEnv } from "../lib.js"
import { pickNotification } from "./utils.js"

const parseJson = (s) => {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

const ENV = assertEnv(process.env.DEPLOY_ENV || ""),
  backend_result = process.env.BACKEND_RESULT || "skipped",
  frontend_result = process.env.FRONTEND_RESULT || "skipped",
  old_hashes = parseJson(process.env.OLD_HASHES),
  new_hashes = parseJson(process.env.NEW_HASHES),
  [title, lines] = pickNotification(backend_result, frontend_result, ENV, old_hashes, new_hashes)

await notifyFeishu(title, lines)
process.exit()
