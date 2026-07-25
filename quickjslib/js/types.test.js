import { test } from "node:test";
import { ok, deepEqual } from "node:assert";
import { readFileSync } from "fs";
import { createQuickJS } from "./quickjs.js";

/**
 * Keeps quickjs.d.ts honest without pulling in a TypeScript toolchain: every
 * member it declares has to exist on a real instance, and every member of the
 * documented API has to be declared. Signatures are not checked - this catches
 * drift in the surface, which is what silently rots.
 */
const declarations = readFileSync(
  new URL("./quickjs.d.ts", import.meta.url),
  "utf-8",
);

function declaredMembers() {
  const body = declarations.slice(
    declarations.indexOf("export interface QuickJS {"),
    declarations.lastIndexOf("}"),
  );
  return new Set([...body.matchAll(/^  (\w+)[(:<]/gm)].map(([, name]) => name));
}

// The surface the README documents, which is what consumers are told to use.
const DOCUMENTED_API = [
  "hostFunctions",
  "evalSource",
  "compileToByteCode",
  "evalByteCode",
  "loadByteCode",
  "callModFunction",
  "getObjectPropertyValue",
  "getPromiseResult",
  "waitForPendingAsyncInvocations",
  "allocateJSstring",
  "setMemoryLimit",
  "requestInterrupt",
  "freeValue",
];

test("every declared member exists on an instance", async () => {
  const quickjs = await createQuickJS();
  for (const name of declaredMembers()) {
    ok(
      quickjs[name] !== undefined,
      `quickjs.d.ts declares ${name}, which does not exist on the instance`,
    );
  }
});

test("the documented API is fully declared", async () => {
  const declared = declaredMembers();
  const missing = DOCUMENTED_API.filter((name) => !declared.has(name));
  deepEqual(missing, [], "documented members missing from quickjs.d.ts");
});

test("the documented API exists on an instance", async () => {
  const quickjs = await createQuickJS();
  const missing = DOCUMENTED_API.filter((name) => quickjs[name] === undefined);
  deepEqual(missing, [], "documented members missing from the implementation");
});
