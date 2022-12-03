#!/bin/bash
RUSTFLAGS='-C link-args=--initial-memory=67108864' cargo wasi test -- --show-output --nocapture