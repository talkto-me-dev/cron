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
