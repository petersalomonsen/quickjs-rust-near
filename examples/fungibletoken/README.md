# A customizable Fungible Token contract

This example contains the standard Fungible Token contract which you can read more about in https://docs.near.org/build/primitives/ft.

The added JavaScript engine makes it for example possible to add custom transfer functions.

Below is an example from the tests, that transfers a fixed amount of `2000` tokens to `alice`. When calling this function, a `transfer_id` is returned, which `alice` then can use to return excessive funds. In this example `alice` can call the `refund` function with the `transfer_id` as argument, and then the account that did the transfer to `alice` will get `1000` tokens in refund.

One of the intended use cases of this is to be able to reserve the max needed tokens for an AI request, and then return back to the caller the unspent tokens.

```javascript
export function start_ai_conversation() {
    const amount = 2_000n;
    let conversation_id = env.signer_account_id()+"_"+(new Date().getTime());
    env.set_data(conversation_id, JSON.stringify({receiver_id: env.signer_account_id(), amount: amount.toString() }));
    env.ft_transfer_internal(env.signer_account_id(), 'aitoken.testnet', amount.toString());
    env.value_return(conversation_id);
}

export function refund_unspent() {
    const { refund_message, signature } = JSON.parse(env.input());
    const public_key = new Uint8Array([]);

    const signature_is_valid = env.ed25519_verify(new Uint8Array(signature), new Uint8Array(env.sha256_utf8(refund_message)) , public_key);
    if (signature_is_valid) {
        const { receiver_id, refund_amount, conversation_id } = JSON.parse(refund_message);
        const conversation_data = JSON.parse(env.get_data(conversation_id));
        if (BigInt(conversation_data.amount) > BigInt(refund_amount)) {
            env.clear_data(conversation_id);
            env.ft_transfer_internal('aitoken.testnet', receiver_id, refund_amount);            
            print(`refunded ${amount} to ${receiver_id}`);
        }
    }
}
```

# Deploying and creating your token

Build the contract by running the script [build.sh](./build.sh).

Then you can deploy the contract, using [near-cli-rs](https://github.com/near/near-cli-rs), with the command below (replace with your own account and preferred signing method).

```bash
near contract deploy aitoken.testnet use-file out/fungible_token.wasm without-init-call network-config testnet sign-with-keychain send
```

To mint the Fungible Token you can call the `new` function on the contract. Here is an example:

```bash
near contract call-function as-transaction aitoken.testnet new json-args '{"owner_id": "aitoken.testnet", "total_supply": "999999999999", "metadata": { "spec": "ft-1.0.0","name": "W-awesome AI token","symbol": "WASMAI","decimals": 6}}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as aitoken.testnet network-config testnet sign-with-keychain send
```

# Posting Javascript to the contract

You can post your custom Javascript to the contract by calling the `post_javascript` function. You don't need a full access key to do this, a function access key owned by the contract account is sufficient. Here is an example posting the JavaScript file [aiconversation.js](./e2e/aiconversation.js).

```bash
near contract call-function as-transaction aitoken.testnet post_javascript json-args "$(jq -Rs '{javascript: .}' < e2e/aiconversation.js)" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as aitoken.testnet network-config testnet sign-with-keychain send
```

# Interacting with the contract

## Preparing, transferring Fungible Tokens to the user account

A user wants to start an AI conversation. Before doing so, the user needs to be obtain some amount of the fungible tokens we just minted. Before an account can receive fungible tokens, it has to be registered with the contract. The user account can register itself.

```bash
near contract call-function as-transaction aitoken.testnet storage_deposit json-args '{"account_id": "aiuser.testnet"}' prepaid-gas '100.0 Tgas' attached-deposit '0.01 near' sign-as aiuser.testnet network-config testnet sign-with-keychain send
```

Now we can transfer 10000 tokens to a `aiuser.testnet` using the following command:

```bash
near contract call-function as-transaction aitoken.testnet ft_transfer json-args '{"receiver_id": "aiuser.testnet", "amount": "10000"}' prepaid-gas '100.0 Tgas' attached-deposit '1 yoctonear' sign-as aitoken.testnet network-config testnet sign-with-keychain send
```

And we can also see that the token balance for `aiuser.testnet` is `10000` by running the following command:

```bash
near contract call-function as-read-only aitoken.testnet ft_balance_of json-args '{"account_id": "aiuser.testnet"}' network-config testnet now
```

## Starting the AI conversation

We can call the Javascript function `start_ai_conversation`:

```bash
near contract call-function as-transaction aitoken.testnet call_js_func json-args '{"function_name": "start_ai_conversation"}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as aiuser.testnet network-config testnet sign-with-keychain send
```

The result of this function call should be a conversation id, that consists of the account name and a timestamp. For example it can be `aiuser.testnet_1729432017818`.

## The AI service

Before serving AI generated content, the AI service will contact the contract to see if the conversation has tokens deposited. It will make a view call to the function `view_ai_conversation` to check the registered data for the given `conversation_id`.

We can also make this view call to see the registered data for the conversation.

```bash
near contract call-function as-read-only aitoken.testnet view_js_func json-args '{"function_name": "view_ai_conversation", "conversation_id": "aiuser.testnet_1729432017818"}' network-config testnet now
```

We should see a result like this:

```
{
  "amount": "2000",
  "receiver_id": "aiuser.testnet"
}
```

The AI service is now good to go, and will track usage for this conversation.
