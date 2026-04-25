#!/usr/bin/env bun

import { run, assertEnv, GITCODE_TOKEN } from "../lib.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  run("git", ["clone", "-q", "-b", branch, url, path], { redact: [GITCODE_TOKEN] })
}

const REPOS = [
  ["site", "workdir/site"],
  ["vibe", "workdir/site/vibe"],
  ["static", "workdir/site/static"],
  ["srv", "workdir/srv"],
  ["ai", "workdir/ai"],
  ["lib", "workdir/lib"],
  ["i.conf", "workdir/conf"],
  ["docker", "workdir/docker"],
]

for (const [repo, path] of REPOS) cloneFull("myaier/" + repo, "dev", path)

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
