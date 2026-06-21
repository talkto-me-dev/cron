#!/usr/bin/env bun

// alpha_cn 前端交付：runner(境外)干净 clone 全仓(dev) → 构建 → 阿里 OSS+CDN(dist.alpha_cn_cdn.sh)。
// 与后端解耦、并行；不 SSH 境内机。阿里 AK/SK 在 conf/alpha_cn/ALI.js（clone 即得），无需 secret。
// i18n 走 Google（仅构建期）→ runner 境外满足。仿 global server_deploy/frontend.js，但全仓 dev。

import { run, GITCODE_TOKEN } from "../lib.js"
import { bashRetryFn } from "../server_deploy/utils.js"

const REPOS_INDEP = [
  ["srv", "workdir/srv"],
  ["ai", "workdir/ai"],
  ["lib", "workdir/lib"],
  ["i.conf", "workdir/conf"],
  ["docker", "workdir/docker"],
]
const REPOS_UNDER_SITE = [
  ["vibe", "workdir/site/vibe"],
  ["static", "workdir/site/static"],
]

const cloneLine = (repo, path, bg) => "clone myaier/" + repo + " " + path + (bg ? " &" : "")

// site 须先于 vibe/static（后者克隆进 site 子目录）；其余仓并发克隆
const cloneScript = [
  "set -e",
  bashRetryFn,
  'clone() { local repo=$1 path=$2; rm -rf "$path"; retry git clone -q --depth=1 -b dev "https://oauth2:${GITCODE_TOKEN}@gitcode.com/${repo}.git" "$path"; }',
  ...REPOS_INDEP.map(([r, p]) => cloneLine(r, p, true)),
  cloneLine("site", "workdir/site", false),
  ...REPOS_UNDER_SITE.map(([r, p]) => cloneLine(r, p, true)),
  "wait",
].join("\n")
run("bash", ["-c", cloneScript], { stdio: "inherit", redact: [GITCODE_TOKEN] })

run("bash", ["-c", [
  "set -ex",
  bashRetryFn,
  "cd workdir/site",
  "retry bun i",
  "rm -rf $HOME/.bun/install/node_modules",
  'ln -sfn "$(realpath node_modules)" $HOME/.bun/install/node_modules',
  "cd ../srv && retry bun i && ./build.sh && cd ../site",
  "./build.sh",
  "retry ./sh/dist.alpha_cn_cdn.sh",
].join("\n")], { stdio: "inherit" })

process.exit()
