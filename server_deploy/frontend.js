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

// install lib deps + run srv build to generate .gen/fn (site fn symlink target)
run("bash", [
  "-c",
  "cd workdir/lib && bun i && cd ../srv && bun i && ./build.sh",
], { stdio: "inherit" })

// site: use npm install (bun cache hardlinks break @3-/zx peer-dep resolution)
const script = ENV === "alpha" ? "./sh/dist.alpha.sh" : "./sh/dist.prod.sh"
run("bash", [
  "-c",
  "cd workdir/site && rm -f bun.lock && npm install --legacy-peer-deps --no-audit --no-fund && " + script,
], { stdio: "inherit" })

process.exit()
