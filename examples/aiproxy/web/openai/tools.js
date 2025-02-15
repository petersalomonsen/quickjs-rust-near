export const toolImplemenations = {
    "run_javascript": async function(source) {    
        return "will not run";
    }
}

export const tools = [
  {
    type: "function",
    function: {
      name: "run_javascript",
      description: "Run javascript snippet in a secure sandbox where there is no access to NPM libraries, NodeJS APIs or web APIs.",
      parameters: {
        type: "object",
        properties: {
          "script": {
            "type": "string",
            "description": "Javascript code"
        }},
        additionalProperties: false,
        required: ["script"],
      },
      strict: true,
    },
  }
];
