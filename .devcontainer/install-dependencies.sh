#!/bin/bash

yarn install

# Install Rust targets
rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1

# Install Binaryen
wget https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz
tar -xvzf binaryen-version_116-x86_64-linux.tar.gz 
export PATH="$(pwd)/binaryen-version_116/bin:$PATH"

# Install Wasmtime
curl https://wasmtime.dev/install.sh -sSf | bash
export PATH="$HOME/.wasmtime/bin:$PATH"

# Install QuickJS
wget https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz
tar -xf quickjs-2024-01-13.tar.xz
rm quickjs-2024-01-13.tar.xz

# Install WABT (WebAssembly Binary Toolkit)
wget https://github.com/WebAssembly/wabt/releases/download/1.0.35/wabt-1.0.35.tar.xz
tar -xvf wabt-1.0.35.tar.xz
cd wabt-1.0.35
mkdir build
cd build
cmake ..
cd ../..
export PATH="$(pwd)/wabt-1.0.35/bin:$PATH"

# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
cd ..
