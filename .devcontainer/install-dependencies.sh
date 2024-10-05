#!/bin/bash

rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1

wget https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz
tar -xvzf binaryen-version_116-x86_64-linux.tar.gz 
sudo cp -r binaryen-version_116/* /usr/
rm -Rf binaryen-version_116*

curl https://wasmtime.dev/install.sh -sSf | bash
export PATH="$HOME/.wasmtime/bin:$PATH"

wget https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz
tar -xf quickjs-2024-01-13.tar.xz
rm quickjs-2024-01-13.tar.xz

wget https://github.com/WebAssembly/wabt/releases/download/1.0.35/wabt-1.0.35.tar.xz
tar -xvf wabt-1.0.35.tar.xz
cd wabt-1.0.35
mkdir build
cd build
cmake ..
sudo cmake --build . --target install
cd ..
cd ..

git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
cd ..

# Explicitly source the cargo environment to propagate it for subsequent steps
echo "source $HOME/.cargo/env" >> $GITHUB_ENV
