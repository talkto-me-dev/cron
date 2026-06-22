#!/usr/bin/env bun

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
