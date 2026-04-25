#!/usr/bin/env bash

set -e
DIR=$(realpath $0) && DIR=${DIR%/*}
cd $DIR
set -a
PATH=$(dirname $DIR)/bin:$PATH
set +a
set -x

curl -fsSL https://github.com/sqldef/sqldef/releases/latest/download/mysqldef_linux_amd64.tar.gz | tar xz
sudo mv mysqldef /usr/local/bin/

bun i

./main.js
