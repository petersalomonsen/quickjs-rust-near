import { test } from "node:test";
import { readFileSync } from "fs";
import { createQuickJS } from "./quickjs.js";

// Read the README file
const readmePath = new URL("../README.md", import.meta.url);
const readmeContent = readFileSync(readmePath, "utf-8");

// Extract JavaScript code blocks from README with their context
function extractCodeExamples(markdown) {
  const examples = [];
  const lines = markdown.split("\n");
  let currentSection = "";
  let inCodeBlock = false;
  let currentCode = [];
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section headers
    if (line.match(/^#+\s+/)) {
      currentSection = line.replace(/^#+\s+/, "").trim();
    }

    // Start of code block
    if (line === "```javascript") {
      inCodeBlock = true;
      currentCode = [];
      blockStartLine = i;
      continue;
    }

    // End of code block
    if (inCodeBlock && line === "```") {
      inCodeBlock = false;

      const code = currentCode.join("\n");

      // Skip pure imports or empty blocks
      if (code.trim() && !code.trim().match(/^import\s+.*from\s+.*$/)) {
        examples.push({
          section: currentSection,
          code: code,
          lineNumber: blockStartLine + 1,
        });
      }
      continue;
    }

    // Collect code lines
    if (inCodeBlock) {
      currentCode.push(line);
    }
  }

  return examples;
}

// Group consecutive examples that belong together
function groupExamples(examples) {
  const groups = [];
  let currentGroup = null;

  examples.forEach((example, i) => {
    const prevExample = i > 0 ? examples[i - 1] : null;

    // Check if this example needs the previous one (references quickjs without creating it)
    const needsPrevious =
      example.code.includes("quickjs.") &&
      !example.code.includes("createQuickJS");

    // Check if examples are consecutive and in same section
    const isConsecutive =
      prevExample &&
      prevExample.section === example.section &&
      example.lineNumber - prevExample.lineNumber < 15;

    if (needsPrevious && isConsecutive && currentGroup) {
      // Add to current group
      currentGroup.code += "\n\n" + example.code;
    } else {
      // Start new group
      currentGroup = {
        section: example.section,
        code: example.code,
        lineNumber: example.lineNumber,
      };
      groups.push(currentGroup);
    }
  });

  return groups;
}

// Prepare code for execution
async function executeSnippet(code) {
  // Remove "// returns ..." comments
  let executable = code.replace(/\s*\/\/\s*returns.*$/gm, "");

  // Remove import statements (we'll provide createQuickJS directly)
  executable = executable.replace(
    /import\s*{\s*createQuickJS\s*}\s*from\s*["'].*?["'];?\s*/g,
    "",
  );

  // Add quickjs initialization if needed
  if (
    executable.includes("quickjs.") &&
    !executable.includes("createQuickJS")
  ) {
    executable = "const quickjs = await createQuickJS();\n" + executable;
  }

  // Handle special cases for testing
  if (executable.includes("await fetch(url)")) {
    // Mock fetch for the example
    executable = executable.replace(
      "const response = await fetch(url);",
      'const response = { json: async () => ({ status: "success", data: "test data", url }) };',
    );
  }

  // Create the async function and execute it
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const func = new AsyncFunction("createQuickJS", executable);

  try {
    await func(createQuickJS);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const examples = extractCodeExamples(readmeContent);
const grouped = groupExamples(examples);

// Test each group
for (const group of grouped) {
  test(`README Line ${group.lineNumber}: ${group.section}`, async () => {
    const result = await executeSnippet(group.code);

    if (!result.success) {
      throw new Error(
        `Snippet failed: ${result.error}\n\nCode:\n${group.code}`,
      );
    }
  });
}
