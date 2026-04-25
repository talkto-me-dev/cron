#!/usr/bin/env bun

import { run, assertEnv, GITCODE_TOKEN } from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

// clone 用带 token URL 鉴权（默认 stdio：捕获，不回显），随后改为无 token URL +
// credential helper（token 从 env 读取），避免 git 后续操作把 token 打到 stderr
const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  const clean = "https://gitcode.com/" + repo + ".git"
  run("git", ["clone", "-b", branch, url, path], { redact: [GITCODE_TOKEN] })
  run("git", ["-C", path, "remote", "set-url", "origin", clean])
  run("git", [
    "-C", path,
    "config", "credential.https://gitcode.com.helper",
    "!f() { echo username=oauth2; echo password=$GITCODE_TOKEN; }; f",
  ])
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
