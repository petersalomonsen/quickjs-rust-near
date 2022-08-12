Rust smart contract for NEAR with Javascript runtime
====================================================

This is a Proof of Concept of embedding QuickJS with https://github.com/near/near-sdk-rs for being able to execute custom JavaScript code inside a smart contract written in Rust.

The QuickJS runtime is compiled from https://github.com/petersalomonsen/quickjs-wasm-near

The contract has two functions:
- `run_script` accepting javascript as text for compiling on the fly. This however have the limitations that it may use more than the max allowed gas
- `run_bytecode` for running JS pre-compiled into the QuickJS bytecode format. This is the preferred way of running JS. Send the pre-compiled bytecode as a base64 string. See https://github.com/petersalomonsen/quickjs-wasm-near/blob/master/web/compiler/compile.spec.js for examples on compiling JS to QuickJS bytecode.

For building the contract:

```
cargo build --target=wasm32-wasi
mv target/wasm32-wasi/debug/quickjs_rust.wasm main.wasm
wasm2wat main.wasm -o main.wat
```

We need to hack the main.wat a bit to just "mock" the WASI imports. Replace:


```
  (import "env" "_tzset_js" (func $_tzset_js (type 1)))
  (import "env" "_localtime_js" (func $_localtime_js (type 3)))
  (import "env" "_emscripten_date_now" (func $_emscripten_date_now (type 54)))
  (import "wasi_snapshot_preview1" "fd_write" (func $__wasi_fd_write (type 4)))
  (import "wasi_snapshot_preview1" "fd_close" (func $__wasi_fd_close (type 21)))
  (import "wasi_snapshot_preview1" "fd_seek" (func $__wasi_fd_seek (type 55)))
  (import "wasi_snapshot_preview1" "proc_exit" (func $__wasi_proc_exit (type 36)))
  (import "env" "__syscall_getcwd" (func $__syscall_getcwd (type 5)))
  (import "wasi_snapshot_preview1" "environ_sizes_get" (func $__wasi_environ_sizes_get (type 5)))
  (import "wasi_snapshot_preview1" "environ_get" (func $__wasi_environ_get (type 5)))
  (import "wasi_snapshot_preview1" "random_get" (func $_ZN4wasi13lib_generated22wasi_snapshot_preview110random_get17h8ae42acb951b1f06E (type 5)))
```
with

```
    (func $_tzset_js (type 1) nop)
    (func $_localtime_js (type 3) nop)
    (func $_emscripten_date_now (type 54) f64.const 0)
    (func $__wasi_fd_write (type 4) i32.const 0)
    (func $__wasi_fd_close (type 21) i32.const 0)
    (func $__wasi_fd_seek (type 55) i32.const 0)
    (func $__wasi_proc_exit (type 36) nop)
    (func $__syscall_getcwd (type 5) i32.const 0)
    (func $__wasi_environ_sizes_get (type 5) i32.const 0)
    (func $__wasi_environ_get (type 5) i32.const 0)
    (func $_ZN4wasi13lib_generated22wasi_snapshot_preview110random_get17h8ae42acb951b1f06E (type 5) i32.const 0)
```

then finally convert the `main.wat` back to a wasm file and optimize it

```
wat2wasm main.wat
wasm-opt -Oz main.wasm -o out/main.wasm
```

and deploy it:

```
near dev-deploy
```

Test running javascript as text:

```
near call dev-1650299983789-21350249865305 --accountId=psalomo.testnet run_script '{"script": "(function() {return 5*33+22;})();" }'
```

Here are some examples from a deployment to testnet account: `dev-1650299983789-21350249865305`

Test running bytecode ( which is compiled from `JSON.parse('{"a": 222}').a+3`):

```
near call dev-1650299983789-21350249865305 --accountId=psalomo.testnet run_bytecode '{"bytecodebase64": "AgQKcGFyc2UUeyJhIjogMjIyfQJhGDxldmFsc291cmNlPg4ABgCgAQABAAMAABsBogEAAAA4mwAAAELeAAAABN8AAAAkAQBB4AAAALidzSjCAwEA" }'
```

# TODO

- Implement WASI methods in a linkable library so that WAT file does not have to be edited manually
- Implement Web interface for copying base64 encoded bytecode to clipboard (in https://github.com/petersalomonsen/quickjs-wasm-near)
- Expose NEAR environment to JS runtime
