#!/usr/bin/env bash

DIR=$(realpath $0) && DIR=${DIR%/*}
cd $DIR
set -ex

GIT_BASE=$(git remote get-url origin | sed 's/\.git$//')
GIT_ORG=${GIT_BASE%/*}

init_clone() {
  if [ ! -d "$1" ]; then
    git clone -b dev --depth=1 ${2:-${GIT_ORG}/$1}.git $1
  fi
  cd $1
  if [ -f ".mise.toml" ]; then
    mise trust
  fi
  cd ..
}

init_clone conf ${GIT_ORG}/conf
