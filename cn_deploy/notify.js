#!/usr/bin/env bun

import { notifyFeishu } from "../lib.js"
import { pick, parseHashes } from "./utils.js"

const { BACKEND_RESULT = "", FRONTEND_RESULT = "", OLD_HASHES, NEW_HASHES, MYSQLDEF_DIFF } = process.env

const [title, lines] = pick(BACKEND_RESULT, FRONTEND_RESULT, parseHashes(OLD_HASHES), parseHashes(NEW_HASHES), MYSQLDEF_DIFF)

await notifyFeishu(title, lines)
