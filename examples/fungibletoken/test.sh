#!/bin/bash
WASMTIME_BACKTRACE_DETAILS=1 RUSTFLAGS='-C link-args=--initial-memory=67108864' cargo wasi test -- --show-output --nocapture