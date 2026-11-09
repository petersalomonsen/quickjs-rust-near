import { test } from "node:test";
import { equal, throws } from "node:assert";
import { createQuickJS } from "./quickjs.js";

test("evaluate js", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource("42;"), 42);
});

test("instances share no state", async () => {
  const first = await createQuickJS();
  const second = await createQuickJS();

  first.evalSource("globalThis.secret = 42; Object.prototype.polluted = 1;");
  equal(first.evalSource("globalThis.secret;"), 42);
  equal(second.evalSource("typeof globalThis.secret;"), "undefined");
  equal(second.evalSource("typeof ({}).polluted;"), "undefined");
});

test("evaluate js returning a float", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource("0.5;"), 0.5);
  equal(quickjs.evalSource("0.1 + 0.2;"), 0.30000000000000004);
  equal(quickjs.evalSource("1 / 0;"), Infinity);
});

test("evaluate js returning a negative integer", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource("-1;"), -1);
});

test("evaluate js returning a boolean", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource("1 === 1;"), true);
  equal(quickjs.evalSource("1 === 2;"), false);
});

test("evaluate js returning a non-ASCII string", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource(`"æøå 🎵";`), "æøå 🎵");
  equal(quickjs.evalSource(`"æøå" + " " + "🎵";`), "æøå 🎵");
});

test("evaluate js throwing an exception", async () => {
  const quickjs = await createQuickJS();
  throws(() => quickjs.evalSource("undefinedfunction();"), /not defined/);
  equal(quickjs.evalSource("42;"), 42);
});

test("terminate an infinite loop via eval timeout", async () => {
  const quickjs = await createQuickJS();
  throws(
    () => quickjs.evalSource("while(true){}", "<evalsource>", 100),
    /interrupted/,
  );
  equal(quickjs.evalSource("42;"), 42);
});

test("memory limit stops allocation bomb without killing the host", async () => {
  const quickjs = await createQuickJS();
  quickjs.setMemoryLimit(16 * 1024 * 1024);
  throws(() => quickjs.evalSource("new Array(1e9).fill(0);"), /out of memory/);
  equal(quickjs.evalSource("1 + 1;"), 2);
});

test("gradual allocation hits the limit as a catchable exception", async () => {
  const quickjs = await createQuickJS();
  quickjs.setMemoryLimit(12 * 1024 * 1024);
  throws(
    () => quickjs.evalSource("const a = []; for (;;) a.push(new Array(1000));"),
    /out of memory/,
  );
  equal(quickjs.evalSource("1 + 1;"), 2);
});

// Every crossing of the host boundary allocates inside the wasm heap, which
// is a fixed 16.5MB and cannot grow. Without freeing those allocations this
// exhausts the heap and traps partway through.
test("repeated large evaluations do not exhaust the heap", async () => {
  const quickjs = await createQuickJS();
  const source = `/*${"x".repeat(100 * 1024)}*/ 42;`;
  for (let n = 0; n < 150; n++) {
    equal(quickjs.evalSource(source), 42);
    equal(quickjs.evalByteCode(quickjs.compileToByteCode(source)), 42);
  }
});

// Strings are fully copied out to the host, so the underlying JSValue has no
// remaining reader. Retaining them meant a few tens of thousands of string
// returns exhausted the heap.
test("returned strings do not accumulate in the guest heap", async () => {
  const quickjs = await createQuickJS();
  for (let n = 0; n < 60000; n++) {
    equal(
      quickjs.evalSource(`"${"x".repeat(500)}${n}";`).length,
      500 + `${n}`.length,
    );
  }
});

test("object handles can be released with freeValue", async () => {
  const quickjs = await createQuickJS();
  for (let n = 0; n < 300000; n++) {
    const handle = quickjs.evalSource(`({a:${n}});`);
    equal(quickjs.getObjectPropertyValue(handle, "a"), n);
    quickjs.freeValue(handle);
  }
});

// A compile that runs out of heap returns an empty buffer rather than
// raising, which used to surface two calls later as "not a function".
test("a compile that produces no bytecode throws", async () => {
  const quickjs = await createQuickJS();
  let src = "";
  for (let i = 0; i < 20000; i++)
    src += `export function f${i}() { return ${i}; }\n`;
  throws(
    () => quickjs.compileToByteCode(src, "generated.js"),
    /Failed to compile generated.js/,
  );
  throws(() => quickjs.loadByteCode(new Uint8Array(0)), /empty bytecode/);
});

test("compile and run bytecode", async () => {
  const quickjs = await createQuickJS();
  const bytecode = await quickjs.compileToByteCode("42;");
  equal(await quickjs.evalByteCode(bytecode), 42);
});

test("evaluate js returning a promise", async () => {
  const quickjs = await createQuickJS();
  const bytecode = quickjs.compileToByteCode(
    `export async function test() {
        const result = await new Promise(resolve => resolve(883));
        print("The result will be "+result);
        return result;
    }`,
    "test.js",
  );
  const mod = quickjs.loadByteCode(bytecode);
  equal(883, quickjs.getPromiseResult(quickjs.callModFunction(mod, "test")));
});

test("evaluate js calling async function on the host", async () => {
  const quickjs = await createQuickJS();
  quickjs.hostFunctions["sleep"] = async (params) => {
    const duration = quickjs.getObjectPropertyValue(params, "duration");
    console.log("I will sleep for", duration, "milliseconds");
    await new Promise((resolve) => setTimeout(() => resolve(), duration));
    const result = quickjs.allocateJSstring(
      `I slept for ${duration} milliseconds`,
    );
    return result;
  };
  const bytecode = quickjs.compileToByteCode(
    `export async function test() {
        const result = await env.callHostAsync({ function_name: "sleep", duration: 500 });
        print("I got the result: "+result);
        return result;
    }`,
    "test.js",
  );
  const mod = quickjs.loadByteCode(bytecode);
  const promise = quickjs.callModFunction(mod, "test");
  await quickjs.waitForPendingAsyncInvocations();

  const result = quickjs.getPromiseResult(promise);
  equal(result, "I slept for 500 milliseconds");
});

test("non-ASCII string round-trip through a host function", async () => {
  const quickjs = await createQuickJS();
  quickjs.hostFunctions["echo"] = async (params) => {
    const text = quickjs.getObjectPropertyValue(params, "text");
    equal(text, "æøå 🎵");
    return quickjs.allocateJSstring(text + " tilbake");
  };
  const bytecode = quickjs.compileToByteCode(
    `export async function test() {
        return await env.callHostAsync({ function_name: "echo", text: "æøå 🎵" });
    }`,
    "test.js",
  );
  const mod = quickjs.loadByteCode(bytecode);
  const promise = quickjs.callModFunction(mod, "test");
  await quickjs.waitForPendingAsyncInvocations();

  equal(quickjs.getPromiseResult(promise), "æøå 🎵 tilbake");
});

/* Runs `calls` host calls one after another, each answering with a string of
   `chars` characters that the guest drops, and returns how many completed. */
async function hostCallsCompleted(calls, chars) {
  const quickjs = await createQuickJS();
  const answer = "x".repeat(chars);
  quickjs.hostFunctions["answer"] = async () =>
    quickjs.allocateJSstring(answer);
  const mod = quickjs.loadByteCode(
    quickjs.compileToByteCode(
      `export async function run() {
        let done = 0;
        for (let i = 0; i < ${calls}; i++) {
          await env.callHostAsync({ function_name: "answer" });
          done++;
        }
        return done;
      }`,
      "run.js",
    ),
  );
  const promise = quickjs.callModFunction(mod, "run");
  await quickjs.waitForPendingAsyncInvocations();
  return quickjs.getPromiseResult(promise);
}

test("host call results do not accumulate in the guest heap", async () => {
  // 150 MB in total, several times the wasm memory.
  equal(await hostCallsCompleted(5000, 30000), 5000);
});

test("host calls themselves do not accumulate in the guest heap", async () => {
  // About 340 bytes each used to stay behind, which ran out before this.
  equal(await hostCallsCompleted(200000, 10), 200000);
});

test("host calls in flight together each get their own answer", async () => {
  const quickjs = await createQuickJS();
  const waiting = [];
  quickjs.hostFunctions["echo"] = async (params) => {
    const value = quickjs.getObjectPropertyValue(params, "value");
    // Answers arrive in the reverse of the order they were asked.
    await new Promise((resolve) => waiting.push(resolve));
    return quickjs.allocateJSstring(value);
  };
  const mod = quickjs.loadByteCode(
    quickjs.compileToByteCode(
      `export async function run() {
        return JSON.stringify(await Promise.all(["a", "b", "c"].map((value) =>
          env.callHostAsync({ function_name: "echo", value }))));
      }`,
      "run.js",
    ),
  );
  const promise = quickjs.callModFunction(mod, "run");
  while (waiting.length) waiting.pop()();
  await quickjs.waitForPendingAsyncInvocations();
  equal(quickjs.getPromiseResult(promise), '["a","b","c"]');
});

test("a host function returning nothing resolves the guest with undefined", async () => {
  const quickjs = await createQuickJS();
  quickjs.hostFunctions["nothing"] = async () => null;
  const mod = quickjs.loadByteCode(
    quickjs.compileToByteCode(
      `export async function run() {
        const named = await env.callHostAsync({ function_name: "nothing" });
        const missing = await env.callHostAsync({ function_name: "no_such_function" });
        return JSON.stringify([typeof named, typeof missing]);
      }`,
      "run.js",
    ),
  );
  const promise = quickjs.callModFunction(mod, "run");
  await quickjs.waitForPendingAsyncInvocations();
  equal(quickjs.getPromiseResult(promise), '["undefined","undefined"]');
});
