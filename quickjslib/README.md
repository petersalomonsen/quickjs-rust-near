# QuickJS WASM Library

This library provides a WebAssembly wrapper around the QuickJS JavaScript engine, allowing you to run JavaScript code in an isolated environment with bidirectional communication between the host and the sandboxed JavaScript.

## Features

- Run JavaScript code in a sandboxed environment
- Compile JavaScript to bytecode for faster execution
- Load and execute bytecode
- Call JavaScript functions from the host
- Call host functions from JavaScript
- Support for asynchronous JavaScript code and Promises
- Access JavaScript objects and properties

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

## API Reference

### Core Functions

- `createQuickJS()`: Creates a new QuickJS instance
- `evalSource(code, filename?)`: Evaluates JavaScript code
- `compileToByteCode(code, filename?)`: Compiles JavaScript code to bytecode
- `evalByteCode(bytecode)`: Executes bytecode
- `loadByteCode(bytecode)`: Loads a module from bytecode
- `callModFunction(module, functionName)`: Calls a function in a module (note: arguments are not currently supported)

### Promise Handling

- `getPromiseResult(promise)`: Gets the result of a settled promise
- `waitForPendingAsyncInvocations()`: Waits for all pending async operations to complete

### Object Manipulation

- `getObjectPropertyValue(object, propertyName)`: Gets a property value from a JavaScript object
- `allocateJSstring(string)`: Creates a JavaScript string in the QuickJS environment

### Host Function Integration

- `hostFunctions`: Object to register functions that can be called from JavaScript via `env.callHostAsync()`

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
