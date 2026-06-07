#!/usr/bin/env bun

import { run, assertEnv, GITCODE_TOKEN } from "../lib.js"
import { bashRetryFn } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const REPOS_INDEP = [
  ["srv", "workdir/srv", "deploy"],
  ["ai", "workdir/ai", "main"],
  ["lib", "workdir/lib", "dev"],
  ["i.conf", "workdir/conf", "dev"],
  ["docker", "workdir/docker", "dev"],
]
const REPOS_UNDER_SITE = [
  ["vibe", "workdir/site/vibe", "dev"],
  ["static", "workdir/site/static", "dev"],
]

const cloneLine = (repo, path, branch, bg) =>
  `clone myaier/${repo} ${path} ${branch}` + (bg ? " &" : "")

const cloneScript = [
  "set -e",
  bashRetryFn,
  'clone() { local repo=$1 path=$2 branch=$3; rm -rf "$path"; retry git clone -q -b "$branch" "https://oauth2:${GITCODE_TOKEN}@gitcode.com/${repo}.git" "$path"; }',
  ...REPOS_INDEP.map(([r, p, b]) => cloneLine(r, p, b, true)),
  cloneLine("site", "workdir/site", "dev", false),
  ...REPOS_UNDER_SITE.map(([r, p, b]) => cloneLine(r, p, b, true)),
  "wait",
].join("\n")

run("bash", ["-c", cloneScript], { stdio: "inherit", redact: [GITCODE_TOKEN] })

const distScript = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", [
  "set -ex",
  bashRetryFn,
  "cd workdir/site",
  "retry bun i",
  "rm -rf $HOME/.bun/install/node_modules",
  'ln -sfn "$(realpath node_modules)" $HOME/.bun/install/node_modules',
  "cd ../srv && retry bun i && ./build.sh && cd ../site",
  "./build.sh",
  "retry " + distScript,
].join("\n")], { stdio: "inherit" })

process.exit()
