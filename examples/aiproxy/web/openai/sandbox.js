import { createQuickJS } from "https://cdn.jsdelivr.net/npm/quickjs-wasm@0.0.1/js/quickjs.js";
import { keyStores } from "near-api-js";

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
    targetContract,
  ) {
    this.walletSelector = walletSelector;
    this.connectedAccount = connectedAccount;
    this.dynamicToolDefinitions = dynamicToolDefinitions; // Store dynamic tool definitions
    // This is the original callContractTool from tools.js, to be used by the sandboxed callToolOnContract
    this.originalCallContractTool = originalCallContractTool;
    this.targetContract = targetContract;
  }

  /**
   * Signs a message using the connected wallet.
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} - The signature.
   */
  async signMessage(message) {
    const keyStore = new keyStores.BrowserLocalStorageKeyStore(
      localStorage,
      this.targetContract,
    );
    const keyPair = await keyStore.getKey(
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
   * Initializes the QuickJS instance for executing scripts.
   * @returns {Promise<void>}
   */
  async initializeQuickJS() {
    this.quickjs = await createQuickJS();
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

    const quickjs = await createQuickJS();

    // Bind sandbox functions to the QuickJS environment
    quickjs.hostFunctions["signMessage"] = async (params) => {
      const message = quickjs.getObjectPropertyValue(params, "message");
      return quickjs.allocateJSstring(await this.signMessage(message));
    };

    quickjs.hostFunctions["getAccountId"] = async () => {
      return quickjs.allocateJSstring(await this.getAccountId());
    };

    quickjs.hostFunctions["callToolOnContract"] = async (params) => {
      const toolName = quickjs.getObjectPropertyValue(params, "toolName");
      const args = JSON.parse(quickjs.getObjectPropertyValue(params, "args"));

      try {
        return quickjs.allocateJSstring(
          JSON.stringify(await this.callToolOnContract(toolName, args)),
        );
      } catch (e) {
        return quickjs.allocateJSstring(JSON.stringify(e.toString()));
      }
    };

    // Compile the script
    const bytecode = quickjs.compileToByteCode(
      `
      const args = ${JSON.stringify(initialArgs)};
      export async function execute() { ${scriptString} }`,
      "sandbox.js",
    );

    // Load and execute the script
    const mod = quickjs.loadByteCode(bytecode);
    const promise = quickjs.callModFunction(mod, "execute");

    // Wait for any pending async operations
    await quickjs.waitForPendingAsyncInvocations();

    // Get the result of the script execution
    const result = quickjs.getPromiseResult(promise);

    // Clean up the QuickJS instance
    quickjs.wasmInstance.free();

    return result;
  }
}
