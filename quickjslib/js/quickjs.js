import { Wasi } from "./wasi.js";
import { readFile } from "fs/promises";

const JS_TAG_FIRST = -11; /* first negative tag */
const JS_TAG_BIG_DECIMAL = -11;
const JS_TAG_BIG_INT = -10;
const JS_TAG_BIG_FLOAT = -9;
const JS_TAG_SYMBOL = -8;
const JS_TAG_STRING = -7;
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
const JS_TAG_FLOAT64 = 7;
class QuickJS {
  constructor() {
    this.hostFunctions = {};
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
      const wasm = await readFile(new URL("../jseval.wasm", import.meta.url));
      const mod = (
        await WebAssembly.instantiate(wasm, {
          wasi_snapshot_preview1: this.wasi,
          env: {
            js_call_host_async: async (params, resolving_func) => {
              const hostFunctionName = this.getObjectPropertyValue(
                params,
                "function_name",
              );
              console.log("js_call_host_async", hostFunctionName);
              if (this.hostFunctions[hostFunctionName]) {
                const result =
                  await this.hostFunctions[hostFunctionName](params);
                this.wasmInstance.promise_callback(resolving_func, result);
              } else {
                this.wasmInstance.promise_callback(resolving_func, null);
              }
            },
          },
        })
      ).instance;
      this.wasi.init(mod);
      this.wasmInstance = mod.exports;
      this.wasmInstance.init();
      return mod.exports;
    })();
  }

  allocateString(str) {
    const instance = this.wasmInstance;
    const straddr = instance.malloc(str.length + 1);
    const buf = new Uint8Array(instance.memory.buffer, straddr, str.length + 1);
    for (let n = 0; n < str.length; n++) {
      buf[n] = str.charCodeAt(n);
    }
    buf[str.length] = 0;
    return straddr;
  }

  allocateJSstring(str) {
    const strPtr = this.allocateString(str);
    const jsString = this.wasmInstance.new_js_string(strPtr);
    this.wasmInstance.free(strPtr);
    return jsString;
  }

  ptrToString(ptr) {
    const memorybuf = new Uint8Array(
      this.wasmInstance.memory.buffer.slice(ptr),
    );
    const length = memorybuf.findIndex((v) => v == 0);
    return new TextDecoder().decode(memorybuf.slice(0, length));
  }

  evalSource(src, modulefilename = "<evalsource>") {
    const instance = this.wasmInstance;
    return instance.eval_js_source(
      this.allocateString(modulefilename),
      this.allocateString(src),
      modulefilename != "<evalsource>",
    );
  }

  getObjectPropertyValue(jsval, propertyname) {
    return this.convertReturnValue(
      this.wasmInstance.get_js_obj_property(
        jsval,
        this.allocateString(propertyname),
      ),
    );
  }

  getPromiseResult(jsval) {
    return this.convertReturnValue(this.wasmInstance.get_promise_result(jsval));
  }

  convertReturnValue(jsval) {
    const tag = Number(jsval >> 32n);
    switch (tag) {
      case JS_TAG_INT:
        return Number(jsval);
      case JS_TAG_STRING:
        return this.ptrToString(this.wasmInstance.get_js_string(jsval));
      case JS_TAG_OBJECT:
        return jsval;
      case JS_TAG_NULL:
        return null;
      case JS_TAG_UNDEFINED:
        return undefined;
    }
  }

  allocateBuf(binarydata) {
    const instance = this.wasmInstance;
    const bufaddr = instance.malloc(binarydata.length);
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
    const { addr, len } = this.allocateBuf(bytecode);
    return this.wasmInstance.load_js_bytecode(addr, len);
  }

  callModFunction(mod, functionname) {
    return this.convertReturnValue(
      this.wasmInstance.call_js_function(
        mod,
        this.allocateString(functionname),
      ),
    );
  }

  evalByteCode(bytecode) {
    const { addr, len } = this.allocateBuf(bytecode);
    return this.convertReturnValue(
      this.wasmInstance.eval_js_bytecode(addr, len),
    );
  }

  compileToByteCode(src, modulefilename = "<evalsource>") {
    const instance = this.wasmInstance;
    const compiledbytecodebuflenptr = instance.malloc(4);
    const compiledbytecodeaddr = instance.compile_to_bytecode(
      this.allocateString(modulefilename),
      this.allocateString(src),
      compiledbytecodebuflenptr,
      modulefilename != "<evalsource>",
    );

    const compiledbytecodebuflen = new Uint32Array(
      instance.memory.buffer,
      compiledbytecodebuflenptr,
      4,
    )[0];
    console.log("len", compiledbytecodebuflen);

    return new Uint8Array(
      instance.memory.buffer,
      compiledbytecodeaddr,
      compiledbytecodebuflen,
    );
  }
}

export async function createQuickJS() {
  const quickjs = new QuickJS();
  await quickjs.wasmInstancePromise;
  return quickjs;
}
