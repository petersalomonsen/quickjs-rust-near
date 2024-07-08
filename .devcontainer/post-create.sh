#!/bin/bash

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
echo 'source $HOME/.cargo/env' >> $HOME/.bashrc
source $HOME/.cargo/env
rustup target add wasm32-unknown-unknown

wget https://github.com/WebAssembly/binaryen/releases/download/version_116/binaryen-version_116-x86_64-linux.tar.gz
tar -xvzf binaryen-version_116-x86_64-linux.tar.gz 
sudo cp -r binaryen-version_116/* /usr/
rm -Rf binaryen-version_116*

cargo install cargo-wasi
curl https://wasmtime.dev/install.sh -sSf | bash