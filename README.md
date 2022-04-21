```
export QUICKJS_WASM_SYS_WASI_SDK_PATH=$PWD/wasi-sdk-14.0
RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-wasi
```