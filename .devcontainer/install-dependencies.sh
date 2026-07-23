#!/bin/bash

# `near-sandbox`'s install.js throws on Linux-arm64 before our
# `postinstall: patch-package` can run, and yarn classic re-extracts
# packages when it later runs install scripts (clobbering any in-place
# patch). So: install without scripts, apply the patches, then run
# near-sandbox's binary fetcher directly with the patched code.
# On x86_64 this is equivalent to a normal `yarn install`.
yarn install --ignore-scripts
npx patch-package
(cd node_modules/near-workspaces/node_modules/near-sandbox && node dist/install.js)

# Install Rust targets
rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1

# Install Binaryen
wget https://github.com/WebAssembly/binaryen/releases/download/version_131/binaryen-version_131-x86_64-linux.tar.gz
tar -xvzf binaryen-version_131-x86_64-linux.tar.gz 
echo 'export PATH="$(pwd)/binaryen-version_131/bin:$PATH"' >> ~/.bashrc

# Install Wasmtime
curl https://wasmtime.dev/install.sh -sSf | bash
echo 'export PATH="$HOME/.wasmtime/bin:$PATH"' >> ~/.bashrc

# Install QuickJS
wget https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz
tar -xf quickjs-2026-06-04.tar.xz
rm quickjs-2026-06-04.tar.xz

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
