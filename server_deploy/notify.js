#!/usr/bin/env bun

import { notifyFeishu, assertEnv } from "../lib.js"
import { pickNotification, loadSiteConf } from "./utils.js"

const parseJson = (s) => {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

const ENV = assertEnv(process.env.DEPLOY_ENV || ""),
  backend_result = process.env.BACKEND_RESULT || "skipped",
  frontend_result = process.env.FRONTEND_RESULT || "skipped",
  old_hashes = parseJson(process.env.OLD_HASHES),
  new_hashes = parseJson(process.env.NEW_HASHES)

const main_host = process.env.MAIN_HOST || (await loadSiteConf(ENV)).main_host,
  site_url = "https://" + main_host,
  [title, lines] = pickNotification(backend_result, frontend_result, ENV, old_hashes, new_hashes, site_url)

await notifyFeishu(title, lines)
process.exit()
