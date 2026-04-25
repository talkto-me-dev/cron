#!/usr/bin/env bun

import { run, assertEnv, GITCODE_TOKEN } from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  run("git", ["clone", "-b", branch, url, path], { redact: [GITCODE_TOKEN], stdio: "inherit" })
}

cloneFull("myaier/site", "dev", "workdir/site")
cloneFull("myaier/vibe", "dev", "workdir/site/vibe")
cloneFull("myaier/static", "dev", "workdir/site/static")
cloneFull("myaier/srv", "dev", "workdir/srv")
cloneFull("myaier/lib", "dev", "workdir/lib")
cloneFull("myaier/i.conf", "dev", "workdir/conf")
cloneFull("myaier/docker", "dev", "workdir/docker")

// 用 npm 装 site (会自动装 peer dep zx)，用 node 跑 dist.js
// bun runtime 直接从其 install cache 解析包，跳过 node_modules，导致 peer-dep 找不到
run("bash", ["-c", `
  set -ex
  cd workdir/site
  rm -f bun.lock
  npm install --no-audit --no-fund
  CONF=${ENV} node --experimental-vm-modules ./sh/dist.js
`], { stdio: "inherit" })

process.exit()
