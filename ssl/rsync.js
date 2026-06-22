import { join } from "path";
import { readFile } from "fs/promises";
import { writeFileSync, mkdirSync, chmodSync } from "fs";
import { $ } from "@3-/zx";
import ROOT from "../ROOT.js";
import SSL_PUSH from "../conf/SSL_PUSH.js";
import route from "./route.js";
$.verbose = 1;

const SSL = join(ROOT, "gen/ssl"),
  SSH_DIR = join(ROOT, "conf/ssh"),
  SSH_CONFIG = join(SSH_DIR, "ssh_config"),
  ID_ED25519 = join(SSH_DIR, "id_ed25519"),
  SSH_ARGS = `-F ${SSH_CONFIG} -i ${ID_ED25519} -o StrictHostKeyChecking=no`,
  HOST_LI = (await readFile(SSH_CONFIG, "utf8"))
    .split("\n")
    .filter((i) => i.startsWith("Host "))
    .map((i) => i.slice(5).trim())
    .filter((i) => i !== "*"),
  // 被 SSL_PUSH 显式占用的 host 不进默认集合，故 cn 只收 talkto.bio，c1/c2/c3 不收
  hostsFor = route(SSL_PUSH, HOST_LI);

chmodSync(ID_ED25519, 0o600);

// 只在实际收到证书的 host 上跑 reload hook（避免改 talkto.me 证书时白白 reload cn）
export const runHook = async (updates) => {
  const hosts = new Set([...updates.keys()].flatMap(hostsFor));
  await Promise.all(
    [...hosts].map(async (host) => {
      await $`ssh ${SSH_ARGS.split(" ")} ${host} "/usr/bin/env bash -c 'if [ -f /opt/hook/ssl.update ]; then /opt/hook/ssl.update; fi'"`;
    }),
  );
};

export default async (domain, key_crt) => {
  const dir = join(SSL, domain),
    ssl_dir = `/mnt/ssl/${domain}`;

  mkdirSync(dir, { recursive: true });
  ["key", "crt"].forEach((i, idx) => writeFileSync(join(dir, `${i}.pem`), key_crt[idx]));

  await Promise.all(
    hostsFor(domain).map(async (host) => {
      await $`ssh ${SSH_ARGS.split(" ")} ${host} "mkdir -p ${ssl_dir}"`;
      await $`rsync -avzL --delete -e ${"ssh " + SSH_ARGS} ${dir}/ ${host}:${ssl_dir}/`;
    }),
  );
};
