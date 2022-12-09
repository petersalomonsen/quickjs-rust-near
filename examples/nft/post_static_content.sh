#!/bin/bash
echo "Posting static content to $1"

CONTENTBASE64=`cat web4/dist/index.html | base64`
near call $1 post_content --gas=300000000000000 --accountId=$1 "{\"key\": \"/index.html\", \"valuebase64\": \"$CONTENTBASE64\"}"

myArray=("/serviceworker.js" \
    "/musicwasms/fall.wasm" \
    "/musicwasms/firstattempt.wasm" \
    "/musicwasms/goodtimes.wasm" \
    "/musicwasms/grooveisinthecode.wasm" \
    "/musicwasms/noiseandmadness.wasm" \
    "/musicwasms/shufflechill.wasm" \
    "/musicwasms/wasmsong.wasm" \
    "/musicwasms/wasmsummit2020.wasm" \
    "/musicwasms/wasmsummit2021.wasm" \
    "/musicwasms/webchipmusic.wasm" \
)
for str in ${myArray[@]}; do
    CONTENTBASE64=`cat web4$str | base64`
    near call $1 post_content --gas=300000000000000 --accountId=$1 "{\"key\": \"$str\", \"valuebase64\": \"$CONTENTBASE64\"}"
done
