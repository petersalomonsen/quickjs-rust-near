#!/bin/bash

# Install Rust targets
rustup target add wasm32-unknown-unknown
rustup target add wasm32-wasip1

# Install Binaryen
wget https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz
tar -xvzf binaryen-version_116-x86_64-linux.tar.gz 
sudo cp -r binaryen-version_116/* /usr/
rm -Rf binaryen-version_116*

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
sudo cmake --build . --target install
cd ../..

# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
cd ..

# Ensure Rust environment is set up properly
if [ -f "$HOME/.cargo/env" ]; then
  # If the file exists, source it
  echo "source $HOME/.cargo/env" >> $GITHUB_ENV
else
  # Fallback to manually adding cargo to PATH
  export PATH="$HOME/.cargo/bin:$PATH"
  echo "$HOME/.cargo/bin" >> $GITHUB_PATH
fi

# Add Wasmtime PATH
echo "$HOME/.wasmtime/bin" >> $GITHUB_PATH

# Add Emscripten environment setup to the GITHUB_ENV to persist across steps
echo "source $(pwd)/emsdk/emsdk_env.sh" >> $GITHUB_ENV
