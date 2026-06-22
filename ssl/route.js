// 证书 → 目标 host 路由：显式映射优先，未列出的域走「全局 host 减去被显式占用的 host」
export default (SSL_PUSH, HOST_LI) => {
  const claimed = new Set(Object.values(SSL_PUSH).flat()),
    default_hosts = HOST_LI.filter((h) => !claimed.has(h));
  return (domain) => SSL_PUSH[domain] || default_hosts;
};
