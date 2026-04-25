import { spawnSync } from "child_process"
import { readFileSync } from "fs"

export const schemaDiff = (online_file, desired_file) => {
  const result = spawnSync(
    "mysqldef",
    ["--enable-drop", online_file],
    { input: readFileSync(desired_file), encoding: "utf-8" },
  )
  if (result.error) throw new Error("mysqldef spawn failed: " + result.error.message)
  if (result.status !== 0)
    throw new Error("mysqldef exit " + result.status + ":\n" + (result.stderr || result.stdout))
  const raw = (result.stdout || "").trim()
  if (!raw || raw.includes("Nothing is modified")) return ""
  return raw
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("-- ") && l !== "BEGIN;" && l !== "COMMIT;")
    .join("\n")
    .trim()
}

export const migrationName = (diff_sql, date = new Date()) => {
  const ts = date.toISOString().replace(/[-:T]/g, "").slice(0, 14),
    tables = [
      ...new Set(
        [
          ...diff_sql.matchAll(
            /(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:IF\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?/gi,
          ),
        ].map((m) => m[1]),
      ),
    ],
    suffix = tables.length
      ? tables.slice(0, 3).join("_") + (tables.length > 3 ? "_etc" : "")
      : "schema_diff"
  return ts + "_" + suffix + ".sql"
}
