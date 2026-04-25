export const buildDatabaseUrl = (tidb) => {
  const { username, password, hostname, port, database, tls } = tidb
  return (
    "mysql://" + username + ":" + password + "@" + hostname + ":" + port + "/" + database +
    (tls ? "?tls=true" : "")
  )
}
