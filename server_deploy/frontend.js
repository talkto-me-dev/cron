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
cloneFull("myaier/ai", "dev", "workdir/ai")
cloneFull("myaier/lib", "dev", "workdir/lib")
cloneFull("myaier/i.conf", "dev", "workdir/conf")
cloneFull("myaier/docker", "dev", "workdir/docker")

// 与 init.sh 一致：每个 package.json 跑 ncu -u + rm bun.lock + bun i
// 然后在 srv 跑 build.sh 生成 .gen/fn（site fn symlink 目标）
// site 需先把 @3-/zx 的 peerDep zx 提升为 direct dep（bun 不自动装 peer）
run("bash", ["-c", `
set -ex
bun i -g npm-check-updates
cd workdir
node -e 'const f="site/package.json",p=require("./"+f);p.devDependencies.zx="^8";require("fs").writeFileSync(f,JSON.stringify(p,null,2))'
for d in lib srv ai site site/vibe site/static; do
  if [ -f "$d/package.json" ]; then
    cd "$d"
    ncu -u || true
    rm -f bun.lock
    bun i
    cd - > /dev/null
  fi
done
cd srv && ./build.sh
`], { stdio: "inherit" })

const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", "cd workdir/site && " + script], { stdio: "inherit" })

process.exit()
