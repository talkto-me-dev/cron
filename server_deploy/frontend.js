#!/usr/bin/env bun

import { run, runRetry, assertEnv, GITCODE_TOKEN } from "../lib.js"
import { bashRetryFn } from "./utils.js"

const ENV = assertEnv(process.env.DEPLOY_ENV || "")

const cloneFull = (repo, branch, path) => {
  const url = "https://oauth2:" + GITCODE_TOKEN + "@gitcode.com/" + repo + ".git"
  runRetry("git", ["clone", "-q", "-b", branch, url, path], {
    redact: [GITCODE_TOKEN],
    label: "clone " + repo,
    onRetry: () => run("rm", ["-rf", path]),
  })
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

for (const [repo, path] of REPOS) {
  const branch = repo === "ai" ? "main" : "dev"
  cloneFull("myaier/" + repo, branch, path)
}

const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", ["-c", [
  "set -ex",
  bashRetryFn,
  "cd workdir/site",
  "retry bun i",
  "rm -rf $HOME/.bun/install/node_modules",
  'ln -sfn "$(realpath node_modules)" $HOME/.bun/install/node_modules',
  "cd ../srv && retry bun i && ./build.sh && cd ../site",
  "./build.sh",
  "retry " + script,
].join("\n")], { stdio: "inherit" })

process.exit()
