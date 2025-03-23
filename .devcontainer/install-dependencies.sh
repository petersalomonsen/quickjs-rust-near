#!/bin/bash

yarn install

# Install Rust targets
rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1

# Install Binaryen
wget https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz
tar -xvzf binaryen-version_116-x86_64-linux.tar.gz 
echo 'export PATH="$(pwd)/binaryen-version_116/bin:$PATH"' >> ~/.bashrc

# Install Wasmtime
curl https://wasmtime.dev/install.sh -sSf | bash
echo 'export PATH="$HOME/.wasmtime/bin:$PATH"' >> ~/.bashrc

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
cmake --build .
cd ../..
echo 'export PATH="$(pwd)/wabt-1.0.35/bin:$PATH"' >> ~/.bashrc

# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git checkout 3.1.74 
./emsdk install latest
./emsdk activate latest
cd ..

cargo install static-web-server
yarn playwright install --with-deps

curl -fsSL https://developer.fermyon.com/downloads/install.sh | bash
mkdir -p ./bin
mv ./spin ./bin/spin
export PATH="$(pwd)/bin:$PATH"
echo 'export PATH="$(pwd)/bin:$PATH"' >> ~/.bashrc
