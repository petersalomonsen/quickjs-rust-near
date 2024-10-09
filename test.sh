#!/bin/bash

rm target/wasm32-wasip1/debug/deps/quickjs_rust_near-*.wasm
# Compile the test without running it
echo "Compiling tests for wasm32-wasip1 target..."
RUSTFLAGS='-C link-args=--initial-memory=67108864' cargo test --target=wasm32-wasip1 --no-run

# Check if the compilation was successful
if [ $? -ne 0 ]; then
    echo "Compilation failed. Exiting."
    exit 1
fi

# Locate the test file in the target/wasm32-wasip1/debug/deps directory
echo "Locating test file..."
TEST_FILE=$(find target/wasm32-wasip1/debug/deps -name "quickjs_rust_near-*.wasm" -print -quit)

# Check if the test file was found
if [ -z "$TEST_FILE" ]; then
    echo "No test file found. Exiting."
    exit 1
fi

echo "Found test file: $TEST_FILE"

# Run the test file using wasmtime
echo "Running tests with wasmtime..."
wasmtime "$TEST_FILE"

# Check if the tests ran successfully
if [ $? -eq 0 ]; then
    echo "Tests ran successfully!"
else
    echo "Tests failed."
    exit 1
fi
