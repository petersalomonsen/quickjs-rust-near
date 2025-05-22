// /Users/peter/git/quickjs-rust-near/examples/aiproxy/web/openai/sandbox.js

/**
 * Provides a sandboxed environment for executing client-side tool logic.
 */
export class ToolSandbox {
  /**
   *
   * @param {import('@near-wallet-selector/core').WalletSelector} walletSelector
   * @param {import('near-api-js').Account} connectedAccount
   */
  constructor(
    walletSelector,
    connectedAccount,
    dynamicToolDefinitions,
    originalCallContractTool,
  ) {
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
    const keyPair =
      await this.connectedAccount.connection.signer.keyStore.getKey(
        this.connectedAccount.connection.networkId,
        this.connectedAccount.accountId,
      );
    const signatureObj = await keyPair.sign(new TextEncoder().encode(message));
    const signatureBase64 = btoa(
      String.fromCharCode(...signatureObj.signature),
    );

    return signatureBase64;
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
    console.log(
      `Sandbox: callToolOnContract called for tool: ${toolName} with args:`,
      args,
    );
    const contractId = localStorage.getItem("toolContractId");
    if (!contractId) {
      throw new Error(
        "Sandbox: callToolOnContract cannot determine contractId. Make sure a tool contract is selected.",
      );
    }
    return this.originalCallContractTool(
      contractId,
      toolName,
      args,
      this.walletSelector,
      this.connectedAccount,
      this.dynamicToolDefinitions,
      true, // skipClientImplementation = true, to prevent re-execution of client script for the same tool
    );
  }

  /**
   * Executes a clientImplementation script.
   * @param {string} scriptString - The clientImplementation script as a string.
   * @param {object} initialArgs - The arguments passed to the tool by the AI.
   * @returns {Promise<any>} - The result of the executed script.
   */
  async executeClientImplementation(scriptString, initialArgs) {
    console.log(
      "Sandbox: Executing clientImplementation script with args:",
      initialArgs,
    );

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    // The parameters for the sandboxed function are (args, signMessage, getAccountId, callToolOnContract)
    // The scriptString is the body of an async function.
    const scriptFunc = new AsyncFunction(
      "args",
      "signMessage",
      "getAccountId",
      "callToolOnContract",
      scriptString,
    );

    const boundSignMessage = this.signMessage.bind(this);
    const boundGetAccountId = this.getAccountId.bind(this);
    const boundCallToolOnContract = this.callToolOnContract.bind(this);

    try {
      // The script will be called with initialArgs and the bound sandbox functions
      return await scriptFunc(
        initialArgs,
        boundSignMessage,
        boundGetAccountId,
        boundCallToolOnContract,
      );
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
