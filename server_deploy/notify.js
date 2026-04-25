#!/usr/bin/env bun

import { notifyFeishu, assertEnv } from "../lib.js"
import { pickNotification } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")
const backend_result = process.env.BACKEND_RESULT || "skipped"
const frontend_result = process.env.FRONTEND_RESULT || "skipped"

const parseJson = (s) => {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

const old_hashes = parseJson(process.env.OLD_HASHES)
const new_hashes = parseJson(process.env.NEW_HASHES)

const [title, lines] = pickNotification(backend_result, frontend_result, ENV, old_hashes, new_hashes)
await notifyFeishu(title, lines)
process.exit()
