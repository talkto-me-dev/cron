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

// bun i 后把 zx symlink 到 bun cache 祖先目录
// 因为 @3-/zx 真实文件在 cache，运行时从 cache 向上找 zx，必须放到 cache 祖先路径
const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", `
  set -ex
  cd workdir/site
  bun i
  mkdir -p $HOME/.bun/install/node_modules
  ln -sfn "$(realpath node_modules/zx)" $HOME/.bun/install/node_modules/zx
  ${script}
`], { stdio: "inherit" })

process.exit()
