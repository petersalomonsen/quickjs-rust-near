Rust smart contract for NEAR with Javascript runtime
====================================================

This is a Proof of Concept of embedding QuickJS with https://github.com/near/near-sdk-rs for being able to execute custom JavaScript code inside a smart contract written in Rust.

The QuickJS runtime is compiled from https://github.com/petersalomonsen/quickjs-wasm-near

The contract has two functions:
- `run_script` accepting javascript as text for compiling on the fly.
- `run_bytecode` for running JS pre-compiled into the QuickJS bytecode format. Send the pre-compiled bytecode as a base64 string. See https://github.com/petersalomonsen/quickjs-wasm-near/blob/master/web/compiler/compile.spec.js for examples on compiling JS to QuickJS bytecode.

For building the contract:

`RUSTFLAGS='-C link-arg=-s' cargo build --target=wasm32-unknown-unknown --release`

Copy to the deploy dir (make sure to create the `out` directory first):

`cp target/wasm32-unknown-unknown/release/quickjs_rust_near.wasm out/main.wasm`

deploying it:

`near dev-deploy`

Test running javascript as text:

```
near call dev-1650299983789-21350249865305 --accountId=psalomo.testnet run_script '{"script": "(function() {return 5*33+22;})();" }'
```

Here are some examples from a deployment to testnet account: `dev-1650299983789-21350249865305`

Test running bytecode ( which is compiled from `JSON.parse('{"a": 222}').a+3`):

```
near call dev-1650299983789-21350249865305 --accountId=psalomo.testnet run_bytecode '{"bytecodebase64": "AgQKcGFyc2UUeyJhIjogMjIyfQJhGDxldmFsc291cmNlPg4ABgCgAQABAAMAABsBogEAAAA4mwAAAELeAAAABN8AAAAkAQBB4AAAALidzSjCAwEA" }'
```

# Testing

Trying to run tests with `wasm32` targets will not work out of the box. As you will see from running the command below, it will fail when trying to run the compiled test file.

`cargo test --target=wasm32-wasi`

but you can run the wasm file it produces with a WebAssembly runtime like [wasmtime](http://wasmtime.dev), [wasmer](https://wasmer.io/) or [wasm3](https://github.com/wasm3/wasm3/).

Have a look at [test.sh](./test.sh) and try running it and you'll see that it outputs results just like when running normal tests in Rust. 

# TODO

- **DONE** Implement (mock) WASI methods in a linkable library so that WAT file does not have to be edited manually
- **DONE** Integration/Unit testing support for Wasm32 target ( which is not supported with near-sdk-rs, see https://github.com/near/near-sdk-rs/issues/467 )
  - **DONE** Running tests
  - **DONE** Displaying errors (needs a panic hook)
  - **DONE** Minimum NEAR mock env  
- Local simulation in browser/node Wasm runtime with mocked NEAR env in JavaScript
- **DONE** End to End tests (testnet)
- **In progress** Expose NEAR environment in JS runtime
  - **DONE** `env.value_return`
- Implement Web interface for copying base64 encoded bytecode to clipboard (in https://github.com/petersalomonsen/quickjs-wasm-near)

