Rust WebAssembly smart contract for NEAR with Javascript runtime
================================================================

This is a Proof of Concept of embedding QuickJS with https://github.com/near/near-sdk-rs for being able to execute custom JavaScript code inside a smart contract written in Rust.

First of all, have a look at the videos where I present the project

https://www.youtube.com/watch?v=JBZEr__pid0&list=PLv5wm4YuO4IwVNrSsYxeqKrtQZYRML03Z

The QuickJS runtime is compiled from https://github.com/petersalomonsen/quickjs-wasm-near

The contract has two functions:
- `run_script` accepting javascript as text for compiling on the fly.
- `run_bytecode` for running JS pre-compiled into the QuickJS bytecode format. Send the pre-compiled bytecode as a base64 string. See https://github.com/petersalomonsen/quickjs-wasm-near/blob/master/web/compiler/compile.spec.js for examples on compiling JS to QuickJS bytecode.
- `submit_script` for submitting and storing JavaScript and running later
- `run_script_for_account` run script stored by account, returns an integer returned by the script
- `run_script_for_account_no_return` run script stored by account, does not return anything unless the script calls `env.value_return`.

For building and deploying the contract have a look at [buildanddeploy.sh](./buildanddeploy.sh).
# Calling the deployed contract

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

# Web4 and a WebAssembly Music showcase

The web application in the [web4](./web4) folder is a vanilla JS Web Component application for uploading music written in Javascript and also playing it, and accepting parameters in JSON for configuring the playback. It also contains functionality for exporting to WAV. See the video playlist above for a demo.

The music to be played back is fetched in a view method call, and for controlling who can access this view method the JSON parameters payload is signed using the callers private key. The contract will then verify the signature according to the callers public key stored in a transaction before the view method call.

The web application is packaged into a single HTML file using rollup, where the final bundle is embedded into the Rust sources encoded as a base64 string.

# TODO

- **DONE** Implement (mock) WASI methods in a linkable library so that WAT file does not have to be edited manually
- **DONE** Integration/Unit testing support for Wasm32 target ( which is not supported with near-sdk-rs, see https://github.com/near/near-sdk-rs/issues/467 )
  - **DONE** Running tests
  - **DONE** Displaying errors (needs a panic hook)
  - **DONE** Minimum NEAR mock env  
- Local simulation in browser/node Wasm runtime with mocked NEAR env in JavaScript
- **DONE** End to End tests (testnet)
- **DONE** Expose some NEAR environment functions to JS runtime
  - **DONE** `env.value_return`
  - **DONE** `env.input` (no need to load into register first)
  - **DONE** `env.signer_account_id` (no need to load into register first)
- **DONE** Web4 hosting showcase
- NFT implementation configurable with JavaScript
- Implement Web interface for copying base64 encoded bytecode to clipboard (in https://github.com/petersalomonsen/quickjs-wasm-near)

