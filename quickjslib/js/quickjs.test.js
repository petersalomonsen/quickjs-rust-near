import { test } from 'node:test';
import { equal } from 'node:assert';
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