#!/usr/bin/env bun

import { run, assertEnv, GITCODE_TOKEN } from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  // -q 避免 git 把 URL（含 token）写到 stderr
  run("git", ["clone", "-q", "-b", branch, url, path], { redact: [GITCODE_TOKEN] })
}

cloneFull("myaier/site", "dev", "workdir/site")
cloneFull("myaier/vibe", "dev", "workdir/site/vibe")
cloneFull("myaier/static", "dev", "workdir/site/static")
cloneFull("myaier/srv", "dev", "workdir/srv")
cloneFull("myaier/ai", "dev", "workdir/ai")
cloneFull("myaier/lib", "dev", "workdir/lib")
cloneFull("myaier/i.conf", "dev", "workdir/conf")
cloneFull("myaier/docker", "dev", "workdir/docker")

// bun cache 里的 @3-/zx 加载后从其真实路径向上找依赖。
// 把 site/node_modules 整个 symlink 到 bun cache 祖先目录，让所有依赖都能被找到。
// 先跑 dev build 生成 dist/code（i18n 扫描需要），再跑 prod dist。
const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", `
  set -ex
  cd workdir/site
  bun i
  rm -rf $HOME/.bun/install/node_modules
  ln -sfn "$(realpath node_modules)" $HOME/.bun/install/node_modules
  cd ../srv && bun i && ./build.sh && cd ../site
  ./build.sh
  ${script}
`], { stdio: "inherit" })

process.exit()
