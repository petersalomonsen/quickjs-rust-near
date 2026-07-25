# QuickJS WASM Library

This library provides a WebAssembly wrapper around the QuickJS JavaScript engine, allowing you to run JavaScript code in an isolated environment with bidirectional communication between the host and the sandboxed JavaScript.

Published on npm as [`quickjs-wasm`](https://www.npmjs.com/package/quickjs-wasm):

```bash
npm install quickjs-wasm
```

## Features

- Run JavaScript code in a sandboxed environment
- Compile JavaScript to bytecode for faster execution
- Load and execute bytecode
- Call JavaScript functions from the host
- Call host functions from JavaScript
- Support for asynchronous JavaScript code and Promises
- Access JavaScript objects and properties
- Protect the host against runaway guest code with memory limits and eval timeouts

## Intended use: one sandbox per execution

This library is built for **short-lived, single-use JavaScript environments**: create an instance, run one untrusted script, throw the instance away.

Values that are converted to host values — numbers, booleans, strings, `null` — are released as soon as they cross the boundary, as are the buffers and C strings each call allocates, so an instance can serve many evaluations without growing. What an instance does not reclaim on its own is object handles: they are returned to you as opaque `bigint`s and stay alive until you call `freeValue(handle)` or the instance is dropped. Whatever you do not release is reclaimed when the whole wasm instance is dropped and garbage collected by the host.

Creating a fresh instance per execution is also the stronger isolation property: no state carries over between untrusted scripts — no polluted prototypes, no globals stashed by a previous run, nothing observable from one script to the next.

Instances are cheap. The wasm module is fetched and compiled once per page or process and then shared, so every `createQuickJS()` after the first only allocates a fresh linear memory — sharing a compiled `WebAssembly.Module` shares no state.

Both users of this library work that way. In a NEAR smart contract the protocol instantiates the contract wasm per call and discards it afterwards. In [WebAssembly Music](https://github.com/petersalomonsen/javascriptmusic) `createQuickJS()` is called once per song compilation.

If you need a long-lived JS environment shared by many scripts over time, use [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) instead — it manages value lifetimes explicitly.

## The async model

Guest `await` suspends at the JavaScript level *inside* QuickJS: when guest code calls an async host function, QuickJS parks the guest execution as a pending promise and the wasm call returns to the host. There is no Emscripten asyncify (or any stack switching) anywhere — the wasm stack fully unwinds on every host call. The host later resumes the guest by resolving the promise via `promise_callback`, which also runs QuickJS's pending-job loop. This is why `waitForPendingAsyncInvocations()` must be awaited before reading a promise result: it drains the host-side async invocations that resume the guest.

Note that the host JS thread is blocked while wasm executes synchronous guest code — eval timeouts (see [Sandboxing untrusted code](#sandboxing-untrusted-code)) are enforced by a wall-clock check inside QuickJS's interrupt handler, not by preemption. If you need the host to stay responsive regardless of what the guest does, run the sandbox in a Worker.

## Basic Usage

### Creating a QuickJS Instance

```javascript
import { createQuickJS } from "./quickjs.js";

// Create a QuickJS instance
const quickjs = await createQuickJS();
if (!quickjs || typeof quickjs.evalSource !== "function") {
  throw new Error("Failed to create QuickJS instance");
}
```

### Evaluating JavaScript

```javascript
// Evaluate JavaScript code directly
const result = quickjs.evalSource("42;"); // returns 42
if (result !== 42) throw new Error("Expected 42, got " + result);
```

### Compiling and Running Bytecode

```javascript
// Compile JavaScript to bytecode
const bytecode = quickjs.compileToByteCode("42;");
if (!bytecode || bytecode.length === 0)
  throw new Error("Failed to compile bytecode");

// Execute bytecode
const result = quickjs.evalByteCode(bytecode); // returns 42
if (result !== 42) throw new Error("Expected 42, got " + result);
```

## Working with Modules

### Compiling and Loading Modules

```javascript
// Compile a module to bytecode
const bytecode = quickjs.compileToByteCode(
  `
  export function getNumber() {
    return 42;
  }
`,
  "math.js",
);

// Load the module
const mod = quickjs.loadByteCode(bytecode);
if (typeof mod !== "bigint")
  throw new Error("Expected module handle to be bigint");

// Call a function from the module
const result = quickjs.callModFunction(mod, "getNumber"); // returns 42
if (result !== 42) throw new Error("Expected 42, got " + result);
```

## Working with Promises

### Evaluating Async JavaScript

```javascript
// Compile an async function
const bytecode = quickjs.compileToByteCode(
  `
  export async function test() {
    const result = await new Promise(resolve => resolve(883));
    return result;
  }
`,
  "test.js",
);

// Load the module
const mod = quickjs.loadByteCode(bytecode);

// Call the async function
const promise = quickjs.callModFunction(mod, "test");

// Get the result of the promise
const result = quickjs.getPromiseResult(promise); // returns 883
if (result !== 883) throw new Error("Expected 883, got " + result);
```

## Interacting with Host Functions

### Calling Host Functions from JavaScript

```javascript
// Register a host function
quickjs.hostFunctions["sleep"] = async (params) => {
  const duration = quickjs.getObjectPropertyValue(params, "duration");
  await new Promise((resolve) => setTimeout(resolve, duration));
  return quickjs.allocateJSstring(`Slept for ${duration} ms`);
};

// Compile JavaScript that calls the host function
const bytecode = quickjs.compileToByteCode(
  `
  export async function test() {
    const result = await env.callHostAsync({ function_name: "sleep", duration: 500 });
    return result;
  }
`,
  "test.js",
);

// Load and call the function
const mod = quickjs.loadByteCode(bytecode);
const promise = quickjs.callModFunction(mod, "test");

// Wait for any pending async operations to complete
await quickjs.waitForPendingAsyncInvocations();

// Get the result
const result = quickjs.getPromiseResult(promise); // "Slept for 500 ms"
if (result !== "Slept for 500 ms")
  throw new Error("Expected 'Slept for 500 ms', got " + result);
```

### The host-function contract

The pieces above fit together like this:

1. The host registers functions in the `hostFunctions` registry: `quickjs.hostFunctions["name"] = async (params) => { ... }`.
2. Guest code calls `env.callHostAsync({ function_name: "name", ...params })` and awaits the result. `function_name` selects the entry in `hostFunctions`; the whole argument object is passed to the host function as an object handle — read values from it with `getObjectPropertyValue(params, "propertyName")`.
3. The host function returns a QuickJS value handle (e.g. from `allocateJSstring`), or `null`/`undefined`. Internally the wrapper resolves the guest's promise via the wasm export `promise_callback(resolvingFunctions, result)`, which also runs QuickJS's pending-job loop so the guest continues past its `await`.
4. Because host functions are async, the host must `await quickjs.waitForPendingAsyncInvocations()` before reading results with `getPromiseResult(promise)` — this drains all in-flight host invocations (including ones scheduled while draining).

## Sandboxing untrusted code

Untrusted guest code can attempt to hang the host (`while(true){}`) or exhaust memory. Both can be bounded:

```javascript
const quickjs = await createQuickJS();

// Cap how much memory the QuickJS runtime may allocate (bytes)
quickjs.setMemoryLimit(12 * 1024 * 1024);

// An allocation bomb now fails inside the sandbox instead of killing the host
try {
  quickjs.evalSource("new Array(1e9).fill(0);");
  throw new Error("expected the allocation to fail");
} catch (e) {
  if (!e.message.includes("out of memory")) throw e;
}

// The third parameter of evalSource is a timeout in milliseconds
try {
  quickjs.evalSource("while(true){}", "<evalsource>", 100);
  throw new Error("expected the eval to be interrupted");
} catch (e) {
  if (!e.message.includes("interrupted")) throw e;
}

// The sandbox is still fully usable afterwards
const result = quickjs.evalSource("42;");
if (result !== 42) throw new Error("Expected 42, got " + result);
```

`callModFunction(mod, functionName, timeoutMs)` and `evalByteCode(bytecode, timeoutMs)` accept the same timeout parameter. The timeout is enforced by a wall-clock check in QuickJS's interrupt handler, so it also covers pending jobs executed at the end of the call. It does *not* cover guest code resumed later by an async host-function response; `requestInterrupt()` can be called from a host function to terminate the guest when it next resumes.

When an eval fails — an exception thrown by guest code, an interrupted eval, or an exceeded memory limit — the wrapper throws an `Error` whose message is the QuickJS exception message.

The wasm linear memory is a fixed ~16.5MB and cannot grow, so that is the hard ceiling whatever limit you set. Running into it is still reported as a catchable `out of memory` exception and the instance stays usable, but keeping the limit below the ceiling makes the bound explicit and leaves room for the strings and buffers the host bindings allocate on the guest's behalf.

## API Reference

### Core Functions

- `createQuickJS()`: Creates a new QuickJS instance
- `evalSource(code, filename?, timeoutMs?)`: Evaluates JavaScript code
- `compileToByteCode(code, filename?)`: Compiles JavaScript code to bytecode
- `evalByteCode(bytecode, timeoutMs?)`: Executes bytecode
- `loadByteCode(bytecode)`: Loads a module from bytecode
- `callModFunction(module, functionName, timeoutMs?)`: Calls a function in a module (note: arguments are not currently supported)

### Limits and interruption

- `setMemoryLimit(bytes)`: Caps QuickJS runtime allocations; exceeding the cap throws an "out of memory" exception inside the sandbox
- `timeoutMs` parameters: interrupt the guest with an "interrupted" exception once the wall-clock deadline passes
- `requestInterrupt()`: Requests that the guest is interrupted at its next resumption (useful from async host functions); cleared when the next timeout-guarded call completes

### Promise Handling

- `getPromiseResult(promise)`: Gets the result of a settled promise
- `waitForPendingAsyncInvocations()`: Waits for all pending async operations to complete

### Object Manipulation

- `getObjectPropertyValue(object, propertyName)`: Gets a property value from a JavaScript object
- `allocateJSstring(string)`: Creates a JavaScript string in the QuickJS environment
- `freeValue(handle)`: Releases an object handle returned by the sandbox (converted values are released automatically)

### Host Function Integration

- `hostFunctions`: Object to register functions that can be called from JavaScript via `env.callHostAsync()` (see [The host-function contract](#the-host-function-contract))

### Value conversion

Return values from the sandbox are converted to host values: integers, floats, booleans, strings (UTF-8 safe), `null` and `undefined` map to their host equivalents; objects (including promises and module handles) are returned as opaque `bigint` handles for use with `getObjectPropertyValue`/`getPromiseResult`/`callModFunction`.

Converted values are released automatically. Handles are not — they are yours until you call `freeValue(handle)`, since only you know when you have finished reading from one. For the one-script-per-instance model you can ignore this entirely; it matters when a single run produces many handles:

```javascript
const quickjs = await createQuickJS();
const handle = quickjs.evalSource("({ answer: 42 });");
const answer = quickjs.getObjectPropertyValue(handle, "answer");
if (answer !== 42) throw new Error("Expected 42, got " + answer);
quickjs.freeValue(handle);
```

A failed compile throws rather than returning empty bytecode, so a source too large to compile is reported at `compileToByteCode` instead of surfacing later as a call on a broken module.

## Building from source

`./build.sh` produces `jseval.wasm`. It downloads a pinned QuickJS release (2026-06-04) and uses `emcc` from the PATH, bootstrapping a pinned emsdk if none is installed. The build is reproducible: two clean builds with the same toolchain produce byte-identical wasm.

## Examples

### Basic Example

```javascript
const quickjs = await createQuickJS();
const result = quickjs.evalSource("40 + 2"); // returns 42
if (result !== 42) throw new Error("Expected 42, got " + result);
```

### Module Example

```javascript
const quickjs = await createQuickJS();
const bytecode = quickjs.compileToByteCode(
  `
  export function greet() {
    return "Hello, World!";
  }
`,
  "greet.js",
);
const mod = quickjs.loadByteCode(bytecode);
const greeting = quickjs.callModFunction(mod, "greet"); // returns "Hello, World!"
if (greeting !== "Hello, World!")
  throw new Error("Expected 'Hello, World!', got " + greeting);
```

### Async Example with Host Functions

```javascript
const quickjs = await createQuickJS();

// Register a host function
quickjs.hostFunctions["fetchData"] = async (params) => {
  const url = quickjs.getObjectPropertyValue(params, "url");
  const response = await fetch(url);
  const data = await response.json();
  return quickjs.allocateJSstring(JSON.stringify(data));
};

// Create and run code that uses the host function
const bytecode = quickjs.compileToByteCode(
  `
  export async function getData() {
    const data = await env.callHostAsync({
      function_name: "fetchData",
      url: "https://api.example.com/data"
    });
    return data; // Return as string, objects become bigint references
  }
`,
  "fetch.js",
);

const mod = quickjs.loadByteCode(bytecode);
const promise = quickjs.callModFunction(mod, "getData");
await quickjs.waitForPendingAsyncInvocations();
const result = quickjs.getPromiseResult(promise); // Returns JSON string
const parsedResult = JSON.parse(result); // Parse on the host side
if (!parsedResult.status || parsedResult.status !== "success") {
  throw new Error("Expected success status in result");
}
```
