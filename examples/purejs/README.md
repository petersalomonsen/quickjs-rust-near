Javascript libraries as WebAssembly binaries
============================================

This is a simple demo of making the exported functions of a Javascript module as exported functions on a WebAssembly binary, without recompling the whole WebAssembly module, but rather manipulate the WebAssembly Text format.

Given the Javascript code with the two exported functions `hello` and `add`:

```javascript
export function hello() {
    const name = JSON.parse(env.input()).name;
    env.value_return('hello ' + name);
}

export function add() {
    const input = JSON.parse(env.input());
    const result = (input.a + input.b);
    env.value_return(JSON.stringify({result}));
}
```

We would like to see a WebAssembly binary with the following exports:

```
(export "hello" (func $hello.command_export))
(export "add" (func $add.command_export))  
```

Instead of recompiling the Rust code with public functions for each of these and implementations that call into javascript via quickjs, we can rather have a generic function in the Rust code that we manipulate and duplicate in WAT after. See `some_js_function` in [lib.rs](./src/lib.rs).

See [manipulatepurejswat.js](./manipulatepurejswat.js) for how the wat file is manipulated programatically.

Finally see [callpurejswasm.js](./callpurejswasm.js) where we call the exported functions on the WebAssembly binary.
