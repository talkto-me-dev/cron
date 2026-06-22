import Alidns, { AddDomainRecordRequest, DeleteDomainRecordRequest, DescribeSubDomainRecordsRequest } from "@alicloud/alidns20150109"
import { Config } from "@alicloud/openapi-client"
import { ALI_DOMAIN_KEY, ALI_DOMAIN_SK } from "../conf/ALI.js"

const MIN_TTL = 600,
  client = new Alidns(new Config({ accessKeyId: ALI_DOMAIN_KEY, accessKeySecret: ALI_DOMAIN_SK, endpoint: "alidns.aliyuncs.com" })),
  records = async (host, rr, type) =>
    (await client.describeSubDomainRecords(new DescribeSubDomainRecordsRequest({ domainName: host, subDomain: rr + "." + host, type }))).body?.domainRecords?.record || []

export default (host) => {
  const set = async (type, rr, content, ttl) => {
      const exist = await records(host, rr, type)
      if (exist.some((r) => r.value === content)) return
      await client.addDomainRecord(new AddDomainRecordRequest({ domainName: host, RR: rr, type, value: content, TTL: Math.max(ttl || 0, MIN_TTL) }))
    },
    rm = async (rr, type) => {
      for (const r of await records(host, rr, type)) await client.deleteDomainRecord(new DeleteDomainRecordRequest({ recordId: r.recordId }))
    }
  return { set, rm }
}
