import { spawnSync } from "child_process"
import { readFileSync } from "fs"

export const schemaDiff = (online_file, desired_file) => {
  const result = spawnSync("mysqldef", ["--enable-drop", online_file], { input: readFileSync(desired_file), encoding: "utf-8" })
  if (result.error) throw new Error(`Failed to run mysqldef: ${result.error.message}`)
  const raw = (result.stdout || "").trim()
  if (!raw || raw.includes("Nothing is modified")) return ""
  return raw
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("-- ") && l !== "BEGIN;" && l !== "COMMIT;")
    .join("\n")
    .trim()
}

// ALTER TABLE chat ADD ...               → 20260329115400_chat.sql
// ALTER TABLE chat ...; ALTER TABLE user  → 20260329115400_chat_user.sql
// 改了 4+ 张表                             → 20260329115400_chat_user_order_etc.sql
// 无法解析                                 → 20260329115400_schema_diff.sql
export const migrationName = (diff_sql, date = new Date()) => {
  const ts = date.toISOString().replace(/[-:T]/g, "").slice(0, 14),
    tables = [...new Set([...diff_sql.matchAll(/(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:IF\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?/gi)].map(m => m[1]))],
    suffix = tables.length ? tables.slice(0, 3).join("_") + (tables.length > 3 ? "_etc" : "") : "schema_diff"
  return `${ts}_${suffix}.sql`
}
