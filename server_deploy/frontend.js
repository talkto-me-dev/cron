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

// bun cache 里的 @3-/zx 加载后从其真实路径向上找依赖。
// 把 site/node_modules 整个 symlink 到 bun cache 祖先目录，让所有依赖都能被找到。
const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", `
  set -ex
  cd workdir/site
  bun i
  rm -rf $HOME/.bun/install/node_modules
  ln -sfn "$(realpath node_modules)" $HOME/.bun/install/node_modules
  ${script}
`], { stdio: "inherit" })

process.exit()
