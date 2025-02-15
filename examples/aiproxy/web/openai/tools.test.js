import { test } from "node:test";
import { toolImplemenations } from './tools.js';

test("should run javascript tool", async () => {
  await toolImplemenations.run_javascript();
});
