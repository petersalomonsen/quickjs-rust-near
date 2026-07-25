# Changelog

Versions below 0.1.0 do not guarantee a stable API, but behaviour changes are
called out explicitly here. A change to the return contract of a public
function warrants a minor bump rather than a patch, so consumers pinning exact
versions can tell an upgrade apart from a fix.

## 0.0.4

**Behaviour change — two functions now throw where they previously returned:**

| function | before | now |
| --- | --- | --- |
| `compileToByteCode` | returned an empty buffer when the compile failed | throws `Failed to compile <file>: <QuickJS exception>` |
| `loadByteCode` | accepted empty bytecode and returned an unusable handle | throws `Cannot load empty bytecode` |

A caller that inspected the returned length instead of catching would take an
uncaught throw on upgrade. No consumer in this repo or in WebAssembly Music did
so, but this should have been a minor bump.

The motivating consumer is
[`examples/aiproxy/web/openai/sandbox.js`](../examples/aiproxy/web/openai/sandbox.js),
which interpolates untrusted script text straight into `compileToByteCode` with
no `try`/`catch` — an unbounded, possibly invalid source. (The pull request that
made this change cited WebAssembly Music instead, which was wrong: its song
source never reaches `compileToByteCode`. It is passed into the sandbox as a
string and compiled inside the guest, so `compileToByteCode` only ever sees the
fixed-size guest bundle.)

Also in this release:

- Strings returned to the host release their `JSValue` along with the C buffer.
  A string is fully copied out, so nothing can still read it — this makes "no
  cleanup required" true by construction rather than true until a single run
  returns tens of thousands of strings.
- `freeValue(handle)` releases an object handle early. One-shot users never
  need it; see the retention policy in the README.

## 0.0.3

- Frees the wasm-heap allocations made on every crossing of the host boundary:
  sources, filenames, property names, and the bytecode buffers on both sides of
  compile/load. The heap is a fixed ~16.5MB that cannot grow, so sustained work
  in a single run previously exhausted it and trapped.
- Allocation failure throws a clear error instead of writing to address 0.
- Out-of-memory is reported as `InternalError: out of memory` rather than
  `null`. QuickJS throws `JS_NULL` when it cannot allocate the error object,
  and formatting a message needs an allocation too, so both paths degraded.
- `compileToByteCode` returns a copy instead of a view into wasm memory, which
  a later heap-growing allocation would detach.
- The wasm module is compiled once per page or process and shared between
  instances, making `createQuickJS()` roughly 4x cheaper. Each instance still
  gets its own fresh linear memory.

## 0.0.2

- Correct value conversion for QuickJS 2026-06-04: float64 (NaN-boxed) returns,
  signed integers, booleans, rope strings, and guest exceptions surfaced as host
  errors. Previously a non-integer number came back as `undefined`.
- UTF-8 safe strings in both directions; `ptrToString` no longer copies the
  whole wasm memory per call.
- Sandbox limits: `setMemoryLimit(bytes)`, a `timeoutMs` parameter on
  `evalSource`/`evalByteCode`/`callModFunction` backed by a wall-clock interrupt
  handler, and `requestInterrupt()`.
- Reproducible build against pinned QuickJS 2026-06-04 and emsdk 3.1.74,
  verified byte-identical in CI, published with npm provenance.

## 0.0.1

Initial release.
