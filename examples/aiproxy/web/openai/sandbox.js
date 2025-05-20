// /Users/peter/git/quickjs-rust-near/examples/aiproxy/web/openai/sandbox.js

/**
 * Provides a sandboxed environment for executing client-side tool logic.
 */
export class ToolSandbox {
  constructor(walletSelector, connectedAccount, dynamicToolDefinitions, originalCallContractTool) {
    this.walletSelector = walletSelector;
    this.connectedAccount = connectedAccount;
    this.dynamicToolDefinitions = dynamicToolDefinitions; // Store dynamic tool definitions
    // This is the original callContractTool from tools.js, to be used by the sandboxed callToolOnContract
    this.originalCallContractTool = originalCallContractTool;
  }

  /**
   * Signs a message using the connected wallet.
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} - The signature.
   */
  async signMessage(message) {
    console.log(`Sandbox: signMessage called with: ${message}`);
    if (!this.walletSelector || !this.walletSelector.isSignedIn()) {
      throw new Error("User is not signed in. Cannot sign message.");
    }
    // const wallet = await this.walletSelector.wallet();
    // Actual signing logic would go here.
    // For now, returning a mock signature as per the contract's expectation for env.verify_signed_message
    // This is a placeholder and needs to be implemented correctly based on how the contract verifies.
    // The contract's env.verify_signed_message likely expects a signature that can be recovered to a public key.
    // A simple string like "mock_signature_from_sandbox" will not work with actual cryptographic verification.
    // However, for testing the flow, this might be acceptable if the contract's verification is also mocked or lenient for tests.
    console.warn("Sandbox: signMessage is returning a MOCK signature. Actual cryptographic signing needed for production.");
    // The mock signature needs to be in a format that the contract can attempt to parse, even if verification fails.
    // Typically, a base64 encoded string is common for signatures.
    return "c2lnbmF0dXJlX2Zyb21fc2FuZGJveF90ZXN0"; // Placeholder: base64 encoded "signature_from_sandbox_test"
  }

  /**
   * Gets the current user's account ID.
   * @returns {Promise<string>} - The account ID.
   */
  async getAccountId() {
    console.log("Sandbox: getAccountId called");
    if (this.connectedAccount && this.connectedAccount.accountId) {
      return this.connectedAccount.accountId;
    }
    if (this.walletSelector && this.walletSelector.isSignedIn()) {
      const accounts = await this.walletSelector.getAccounts();
      if (accounts.length > 0) {
        return accounts[0].accountId;
      }
    }
    throw new Error("Account ID not available. User might not be signed in.");
  }

  /**
   * Calls a tool on the contract. This is intended to be called from within the clientImplementation script.
   * It uses the original callContractTool function to perform the actual contract call.
   * @param {string} toolName - The name of the tool to call on the contract.
   * @param {object} args - The arguments for the contract tool.
   * @returns {Promise<any>} - The result of the contract tool call.
   */
  async callToolOnContract(toolName, args) {
    console.log(`Sandbox: callToolOnContract called for tool: ${toolName} with args:`, args);
    const contractId = localStorage.getItem("toolContractId"); 
    if (!contractId) {
        throw new Error("Sandbox: callToolOnContract cannot determine contractId. Make sure a tool contract is selected.");
    }
    return this.originalCallContractTool(
        contractId,
        toolName,
        args,
        this.walletSelector,
        this.connectedAccount,
        this.dynamicToolDefinitions, 
        true // skipClientImplementation = true, to prevent re-execution of client script for the same tool
    );
  }

  /**
   * Executes a clientImplementation script.
   * @param {string} scriptString - The clientImplementation script as a string.
   * @param {object} initialArgs - The arguments passed to the tool by the AI.
   * @returns {Promise<any>} - The result of the executed script.
   */
  async executeClientImplementation(scriptString, initialArgs) {
    console.log("Sandbox: Executing clientImplementation script with args:", initialArgs);

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    // The parameters for the sandboxed function are (args, signMessage, getAccountId, callToolOnContract)
    // The scriptString is the body of an async function.
    const scriptFunc = new AsyncFunction("args", "signMessage", "getAccountId", "callToolOnContract", scriptString);
    
    const boundSignMessage = this.signMessage.bind(this);
    const boundGetAccountId = this.getAccountId.bind(this);
    const boundCallToolOnContract = this.callToolOnContract.bind(this);

    try {
      // The script will be called with initialArgs and the bound sandbox functions
      return await scriptFunc(initialArgs, boundSignMessage, boundGetAccountId, boundCallToolOnContract);
    } catch (error) {
      console.error("Error executing clientImplementation script:", error);
      // Augment the error message with more context if possible
      let errorMessage = `Error executing clientImplementation script for tool: ${error.message}`;
      if (error.stack) {
        errorMessage += `\nStack: ${error.stack}`;
      }
      throw new Error(errorMessage);
    }
  }
}

