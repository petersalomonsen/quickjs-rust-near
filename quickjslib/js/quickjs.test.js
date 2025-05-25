import { test } from "node:test";
import { equal } from "node:assert";
import { createQuickJS } from "./quickjs.js";

test("evaluate js", async () => {
  const quickjs = await createQuickJS();
  equal(quickjs.evalSource("42;"), 42);
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

test(
  "evaluate js calling async function on the host",
  { only: true },
  async () => {
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
  },
);
