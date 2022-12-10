#!/bin/bash
echo "Posting quickjs bytecode to $1"
QUICKJS_BYTECODE=`cat $2 | base64`
near call $1 post_quickjs_bytecode --gas=300000000000000 --accountId=$1 "{\"bytecodebase64\": \"$QUICKJS_BYTECODE\"}"
