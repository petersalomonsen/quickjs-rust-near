/**
 * An opaque reference to a value inside the sandbox. Objects, arrays,
 * promises and module namespaces cross the boundary as handles rather than
 * being converted, because converting them would mean copying an arbitrary
 * object graph. Read from one with `getObjectPropertyValue`, resolve one with
 * `getPromiseResult`, call into one with `callModFunction`.
 *
 * Handles are reclaimed when the instance is dropped. There is nothing to
 * release by hand.
 */
export type JSHandle = bigint;

/**
 * What a value from the sandbox becomes on the host. Numbers, strings,
 * booleans, `null` and `undefined` are converted; everything else arrives as
 * a {@link JSHandle}.
 */
export type JSValue = number | string | boolean | JSHandle | null | undefined;

/**
 * A function the guest can call with `env.callHostAsync({ function_name, ... })`.
 *
 * The whole argument object arrives as a handle — read arguments from it with
 * `getObjectPropertyValue`. The return value must be a handle to a value
 * inside the sandbox, which is what `allocateJSstring` produces.
 */
export type HostFunction = (params: JSHandle) => JSHandle | Promise<JSHandle>;

/**
 * The raw wasm exports.
 *
 * @internal Reaching into these is not part of the supported API and they can
 * change with any release. They are declared only because arming an eval
 * deadline around a guest resumed by an async host function currently has no
 * first-class equivalent.
 */
export interface QuickJSWasmExports {
  memory: WebAssembly.Memory;
  set_eval_deadline(deadlineMs: number): void;
  request_interrupt(): void;
  clear_interrupt(): void;
  set_memory_limit(bytes: number): void;
  [name: string]: unknown;
}

export interface QuickJS {
  /**
   * Functions the guest may call through `env.callHostAsync`, keyed by the
   * `function_name` the guest passes.
   */
  hostFunctions: Record<string, HostFunction>;

  /** @internal see {@link QuickJSWasmExports} */
  wasmInstance: QuickJSWasmExports;

  /**
   * Evaluates JavaScript and returns the value of its last expression.
   *
   * @param modulefilename pass a filename to evaluate as a module
   * @param timeoutMs wall-clock budget; the guest is interrupted past it,
   * so `while(true){}` cannot hang the host. 0 means no deadline.
   * @throws if the guest throws, is interrupted, or runs out of memory
   */
  evalSource(src: string, modulefilename?: string, timeoutMs?: number): JSValue;

  /**
   * Compiles to QuickJS bytecode, for evaluating repeatedly or storing.
   *
   * @throws if the source cannot be compiled, including when it is too large
   * to compile within the instance's heap
   */
  compileToByteCode(src: string, modulefilename?: string): Uint8Array;

  /** Evaluates bytecode from {@link QuickJS.compileToByteCode}. */
  evalByteCode(bytecode: Uint8Array, timeoutMs?: number): JSValue;

  /**
   * Loads a compiled module and returns a handle to its namespace.
   *
   * @throws if the bytecode is empty
   */
  loadByteCode(bytecode: Uint8Array): JSHandle;

  /**
   * Calls an exported function of a loaded module. Arguments are not
   * currently supported.
   */
  callModFunction(
    mod: JSHandle,
    functionname: string,
    timeoutMs?: number,
  ): JSValue;

  /** Reads a property from an object handle. */
  getObjectPropertyValue(jsval: JSHandle, propertyname: string): JSValue;

  /**
   * Reads the result of a settled promise handle. Await
   * {@link QuickJS.waitForPendingAsyncInvocations} first if the guest awaited
   * a host function.
   */
  getPromiseResult(jsval: JSHandle): JSValue;

  /**
   * Drains host functions the guest is awaiting, including any scheduled
   * while draining. Guest `await` suspends inside QuickJS, so the guest only
   * continues once these settle.
   */
  waitForPendingAsyncInvocations(): Promise<void>;

  /** Creates a string inside the sandbox — how a host function returns one. */
  allocateJSstring(str: string): JSHandle;

  /**
   * Caps what the QuickJS runtime may allocate. Exceeding it raises a
   * catchable out-of-memory exception inside the sandbox and leaves the
   * instance usable. The wasm heap is a fixed ~16.5MB, so keep the limit
   * below that for it to bind.
   */
  setMemoryLimit(bytes: number): void;

  /**
   * Asks for the guest to be interrupted at its next interrupt check —
   * for cancelling from a host function a guest that is about to resume.
   */
  requestInterrupt(): void;

  /**
   * Releases an object handle early.
   *
   * You almost certainly do not need this: handles are reclaimed when the
   * instance is dropped, and this library is built for one script per
   * instance. It exists for a single run that produces handles in the
   * hundreds of thousands, which would otherwise fill the instance's heap
   * before the run finishes.
   */
  freeValue(handle: JSHandle): void;
}

/**
 * Creates a sandbox. Intended to be used for one untrusted script and then
 * dropped — see "Intended use: one sandbox per execution" in the README.
 */
export declare function createQuickJS(): Promise<QuickJS>;
