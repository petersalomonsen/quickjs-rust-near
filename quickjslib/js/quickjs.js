import { Wasi } from "./wasi.js";

/* Tag values from quickjs-2026-06-04/quickjs.h — must match the QuickJS
   version jseval.wasm is built from. */
const JS_TAG_FIRST = -9; /* first negative tag */
const JS_TAG_BIG_INT = -9;
const JS_TAG_SYMBOL = -8;
const JS_TAG_STRING = -7;
const JS_TAG_STRING_ROPE = -6;
const JS_TAG_MODULE = -3; /* used internally */
const JS_TAG_FUNCTION_BYTECODE = -2; /* used internally */
const JS_TAG_OBJECT = -1;

const JS_TAG_INT = 0;
const JS_TAG_BOOL = 1;
const JS_TAG_NULL = 2;
const JS_TAG_UNDEFINED = 3;
const JS_TAG_UNINITIALIZED = 4;
const JS_TAG_CATCH_OFFSET = 5;
const JS_TAG_EXCEPTION = 6;
const JS_TAG_SHORT_BIG_INT = 7;
const JS_TAG_FLOAT64 = 8;

/* jseval.wasm is a 32-bit build, so QuickJS NaN-boxes doubles: a float64
   JSValue is the raw double bits minus (addend << 32), which makes its
   "tag" (upper 32 bits) fall outside the enumerated tag range above. */
const JS_FLOAT64_TAG_ADDEND = BigInt(0x7ff80000 - JS_TAG_FIRST + 1);

const float64scratch = new DataView(new ArrayBuffer(8));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/* The compiled module is fetched and compiled once and then shared by every
   instance. Each instance still gets its own fresh linear memory - sharing a
   WebAssembly.Module shares no state whatsoever - so the one-sandbox-per-
   execution model keeps its isolation while paying the ~900KB compile only
   on the first createQuickJS() call. */
let compiledModulePromise = null;

function getCompiledModule() {
  if (!compiledModulePromise) {
    compiledModulePromise = (async () => {
      const url = new URL("../jseval.wasm", import.meta.url);
      const wasm =
        url.protocol === "file:"
          ? await (await import("fs/promises")).readFile(url)
          : await fetch(url).then((r) => r.arrayBuffer());
      return await WebAssembly.compile(wasm);
    })().catch((e) => {
      /* Do not cache a failed load, so a later call can retry. */
      compiledModulePromise = null;
      throw e;
    });
  }
  return compiledModulePromise;
}

class QuickJS {
  constructor() {
    this.hostFunctions = {};
    this.pendingAsyncInvocations = [];

    this.wasmInstancePromise = (async () => {
      this.wasi = new Wasi({
        LANG: "en_GB.UTF-8",
        TERM: "xterm",
      });
      this.stdoutlines = [];
      this.stderrlines = [];
      this.wasi.stdout = (...data) => {
        this.stdoutlines.push(data.join(" "));
        console.log(...data);
      };
      this.wasi.stderr = (...data) => {
        this.stderrlines.push(data.join(" "));
        console.error(...data);
      };
      const mod = await WebAssembly.instantiate(await getCompiledModule(), {
        wasi_snapshot_preview1: this.wasi,
        env: {
          js_host_time_ms: () => Date.now(),
          js_call_host_async: async (params, resolving_func) => {
            this.pendingAsyncInvocations.push(
              new Promise(async (resolvePendingInvocation) => {
                try {
                  const hostFunctionName = this.getObjectPropertyValue(
                    params,
                    "function_name",
                  );
                  if (this.hostFunctions[hostFunctionName]) {
                    const result =
                      await this.hostFunctions[hostFunctionName](params);
                    this.wasmInstance.promise_callback(resolving_func, result);
                  } else {
                    this.wasmInstance.promise_callback(resolving_func, null);
                  }
                } finally {
                  resolvePendingInvocation();
                }
              }),
            );
          },
        },
      });
      this.wasi.init(mod);
      this.wasmInstance = mod.exports;
      this.wasmInstance.init();
      return mod.exports;
    })();
  }

  allocateString(str) {
    const instance = this.wasmInstance;
    const encoded = textEncoder.encode(str);
    const straddr = this.checkAllocation(
      instance.malloc(encoded.length + 1),
      encoded.length + 1,
    );
    const buf = new Uint8Array(
      instance.memory.buffer,
      straddr,
      encoded.length + 1,
    );
    buf.set(encoded);
    buf[encoded.length] = 0;
    return straddr;
  }

  allocateJSstring(str) {
    const strPtr = this.allocateString(str);
    const jsString = this.wasmInstance.new_js_string(strPtr);
    this.wasmInstance.free(strPtr);
    return jsString;
  }

  ptrToString(ptr) {
    const memorybuf = new Uint8Array(this.wasmInstance.memory.buffer);
    const end = memorybuf.indexOf(0, ptr);
    return textDecoder.decode(memorybuf.subarray(ptr, end));
  }

  /**
   * Allocates C strings for the duration of `fn` and frees them afterwards.
   * QuickJS copies what it is handed here - sources are consumed during
   * compilation, filenames and property names become interned atoms - so
   * nothing needs to outlive the call.
   */
  withStrings(strings, fn) {
    const ptrs = strings.map((str) => this.allocateString(str));
    try {
      return fn(...ptrs);
    } finally {
      for (const ptr of ptrs) {
        this.wasmInstance.free(ptr);
      }
    }
  }

  /**
   * Allocates a buffer for the duration of `fn` and frees it afterwards.
   * Safe for bytecode: JS_ReadObject duplicates the buffer unless it is
   * given JS_READ_OBJ_ROM_DATA, which this library never does.
   */
  withBuf(binarydata, fn) {
    const { addr, len } = this.allocateBuf(binarydata);
    try {
      return fn(addr, len);
    } finally {
      this.wasmInstance.free(addr);
    }
  }

  /**
   * Limit how much memory the QuickJS runtime may allocate. Allocations
   * beyond the limit fail with an "out of memory" exception inside the
   * sandbox without affecting the host.
   */
  setMemoryLimit(bytes) {
    this.wasmInstance.set_memory_limit(bytes);
  }

  /**
   * Request that the currently scheduled guest execution is interrupted at
   * the next interrupt check. Useful from host functions to cancel a guest
   * that is about to resume. Cleared automatically when a timeout-guarded
   * call completes.
   */
  requestInterrupt() {
    this.wasmInstance.request_interrupt();
  }

  withEvalDeadline(timeoutMs, fn) {
    if (!timeoutMs) {
      return fn();
    }
    this.wasmInstance.set_eval_deadline(Date.now() + timeoutMs);
    try {
      return fn();
    } finally {
      this.wasmInstance.clear_interrupt();
    }
  }

  evalSource(src, modulefilename = "<evalsource>", timeoutMs = 0) {
    const instance = this.wasmInstance;
    return this.withEvalDeadline(timeoutMs, () =>
      this.withStrings([modulefilename, src], (filenameptr, srcptr) =>
        this.convertReturnValue(
          instance.eval_js_source(
            filenameptr,
            srcptr,
            modulefilename != "<evalsource>",
          ),
        ),
      ),
    );
  }

  getObjectPropertyValue(jsval, propertyname) {
    return this.withStrings([propertyname], (nameptr) =>
      this.convertReturnValue(
        this.wasmInstance.get_js_obj_property(jsval, nameptr),
      ),
    );
  }

  getPromiseResult(jsval) {
    return this.convertReturnValue(this.wasmInstance.get_promise_result(jsval));
  }

  async waitForPendingAsyncInvocations() {
    while (this.pendingAsyncInvocations.length > 0) {
      const pending = [...this.pendingAsyncInvocations];
      this.pendingAsyncInvocations = [];
      await Promise.all(pending);
    }
  }

  convertReturnValue(jsval) {
    const tag = Number(jsval >> 32n);
    if ((tag - JS_TAG_FIRST) >>> 0 >= JS_TAG_FLOAT64 - JS_TAG_FIRST) {
      float64scratch.setBigUint64(
        0,
        BigInt.asUintN(64, jsval + (JS_FLOAT64_TAG_ADDEND << 32n)),
      );
      return float64scratch.getFloat64(0);
    }
    switch (tag) {
      case JS_TAG_INT:
        return Number(BigInt.asIntN(32, jsval));
      case JS_TAG_BOOL:
        return BigInt.asIntN(32, jsval) !== 0n;
      case JS_TAG_STRING:
      case JS_TAG_STRING_ROPE: {
        const strptr = this.wasmInstance.get_js_string(jsval);
        try {
          return this.ptrToString(strptr);
        } finally {
          this.wasmInstance.free_js_string(strptr);
        }
      }
      case JS_TAG_OBJECT:
        return jsval;
      case JS_TAG_NULL:
        return null;
      case JS_TAG_UNDEFINED:
        return undefined;
      case JS_TAG_EXCEPTION:
        throw new Error(
          this.stdoutlines[this.stdoutlines.length - 1] ??
            "Exception in QuickJS",
        );
    }
  }

  /**
   * The wasm linear memory is a fixed size and cannot grow, so malloc
   * returns 0 once it is exhausted. Writing at that address would silently
   * corrupt the low end of the heap, so fail loudly instead.
   */
  checkAllocation(addr, size) {
    if (addr === 0) {
      throw new Error(
        `QuickJS sandbox out of memory: could not allocate ${size} bytes`,
      );
    }
    return addr;
  }

  allocateBuf(binarydata) {
    const instance = this.wasmInstance;
    const bufaddr = this.checkAllocation(
      instance.malloc(binarydata.length),
      binarydata.length,
    );
    const buf = new Uint8Array(
      instance.memory.buffer,
      bufaddr,
      binarydata.length,
    );
    for (let n = 0; n < binarydata.length; n++) {
      buf[n] = binarydata[n];
    }
    return { addr: bufaddr, len: buf.length };
  }

  loadByteCode(bytecode) {
    return this.withBuf(bytecode, (addr, len) =>
      this.wasmInstance.load_js_bytecode(addr, len),
    );
  }

  callModFunction(mod, functionname, timeoutMs = 0) {
    return this.withEvalDeadline(timeoutMs, () =>
      this.withStrings([functionname], (nameptr) =>
        this.convertReturnValue(
          this.wasmInstance.call_js_function(mod, nameptr),
        ),
      ),
    );
  }

  evalByteCode(bytecode, timeoutMs = 0) {
    return this.withEvalDeadline(timeoutMs, () =>
      this.withBuf(bytecode, (addr, len) =>
        this.convertReturnValue(this.wasmInstance.eval_js_bytecode(addr, len)),
      ),
    );
  }

  compileToByteCode(src, modulefilename = "<evalsource>") {
    const instance = this.wasmInstance;
    const buflenptr = instance.malloc(4);
    try {
      return this.withStrings([modulefilename, src], (filenameptr, srcptr) => {
        const bytecodeaddr = instance.compile_to_bytecode(
          filenameptr,
          srcptr,
          buflenptr,
          modulefilename != "<evalsource>",
        );
        const buflen = new Uint32Array(instance.memory.buffer, buflenptr, 1)[0];
        try {
          /* Copy out rather than returning a view: any later allocation that
             grows the wasm memory detaches views into it. */
          return new Uint8Array(
            instance.memory.buffer,
            bytecodeaddr,
            buflen,
          ).slice();
        } finally {
          instance.free_js_bytecode(bytecodeaddr);
        }
      });
    } finally {
      instance.free(buflenptr);
    }
  }
}

export async function createQuickJS() {
  const quickjs = new QuickJS();
  await quickjs.wasmInstancePromise;
  return quickjs;
}
