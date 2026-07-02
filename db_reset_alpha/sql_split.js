// 引号感知的 SQL 拆句: 跳过 '/"/` 字符串内的 ; 与注释标记，剔除 -- 行注释和 /* */ 块注释
export default (sql) => {
  const out = [];
  let buf = "",
    quote = "";
  for (let i = 0; i < sql.length; ++i) {
    const c = sql[i];
    if (quote) {
      buf += c;
      if (c === "\\" && quote !== "`") buf += sql[++i] || "";
      else if (c === quote) {
        if (sql[i + 1] === quote) buf += sql[++i]; // 双写转义 '' "" ``
        else quote = "";
      }
    } else if (c === "'" || c === '"' || c === "`") {
      quote = c;
      buf += c;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") ++i;
      buf += "\n";
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 1;
    } else if (c === ";") {
      out.push(buf);
      buf = "";
    } else buf += c;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
};
