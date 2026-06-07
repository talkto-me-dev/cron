import Cdn, {
  DescribeUserDomainsRequest,
  SetCdnDomainSSLCertificateRequest,
  DescribeCdnHttpsDomainListRequest,
} from "@alicloud/cdn20180510"
import { Config } from "@alicloud/openapi-client"
import { ALI_KEY, ALI_SK } from "../conf/ALI.js"

const client = new Cdn(
    new Config({
      accessKeyId: ALI_KEY,
      accessKeySecret: ALI_SK,
      endpoint: "cdn.aliyuncs.com",
    }),
  ),
  paginate = async (fn, extract, size = 100) => {
    const items = []
    let page = 1
    for (;;) {
      const res = await fn(page, size),
        list = extract(res) || []
      items.push(...list)
      if (list.length < size) break
      page++
    }
    return items
  },
  fetchAllDomains = () =>
    paginate(
      (page, size) => client.describeUserDomains(new DescribeUserDomainsRequest({ pageNumber: page, pageSize: size })),
      (r) => r.body?.domains?.pageData,
      500,
    ),
  fetchHttpsCerts = () =>
    paginate(
      (page, size) => client.describeCdnHttpsDomainList(new DescribeCdnHttpsDomainListRequest({ pageNumber: page, pageSize: size })),
      (r) => r.body?.certInfos?.certInfo,
    ),
  domainMatch = (cert_domain, cdn_domain) => {
    if (cert_domain === cdn_domain) return true
    if (cdn_domain === `*.${cert_domain}`) return true
    return cdn_domain.endsWith(`.${cert_domain}`)
  },
  bind = async (name, cert_domain, [key, crt]) => {
    await client.setCdnDomainSSLCertificate(new SetCdnDomainSSLCertificateRequest({
      domainName: name,
      SSLProtocol: "on",
      certType: "upload",
      certName: `${cert_domain}-${Date.now()}`,
      SSLPub: crt,
      SSLPri: key,
    }))
    console.log("cdn bind", name, "<-", cert_domain)
  },
  unbind = async (name) => {
    await client.setCdnDomainSSLCertificate(new SetCdnDomainSSLCertificateRequest({ domainName: name, SSLProtocol: "off" }))
    console.log("cdn clean", name)
  }

export default async (updates) => {
  const all_domains = await fetchAllDomains(),
    https_certs = new Map(
      (await fetchHttpsCerts()).map((i) => [i.domainName, i.certStatus]),
    )

  let bound = 0, cleaned = 0
  for (const d of all_domains) {
    if (d.domainStatus !== "online") continue
    const cert_status = https_certs.get(d.domainName)
    if (cert_status === "ok") continue
    if (cert_status === "expired") {
      await unbind(d.domainName)
      cleaned++
      continue
    }
    for (const [cert_domain, pair] of updates) {
      if (!domainMatch(cert_domain, d.domainName)) continue
      await bind(d.domainName, cert_domain, pair)
      bound++
      break
    }
  }

  console.log(`cdn: bound=${bound} cleaned=${cleaned}`)
}
