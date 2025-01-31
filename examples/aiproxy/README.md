# AI Proxy

This folder contains a [Spin](https://www.fermyon.com/spin) application, based on the WASI 2 and the WebAssembly Component Model ( https://component-model.bytecodealliance.org/ ). It is implemented in Rust as a serverless proxy for the OpenAI API.

There is a simple example of a web client in the [web](./web/) folder.

The application will keep track of token usage per conversation in the built-in key-value storage of Spin. The initial balance for a conversation is retrieved from the Fungible Token smart contract.

To launch the application, make sure to have the Spin SDK installed.

You also need to set some environment variables:

- `SPIN_VARIABLE_OPENAI_API_KEY` your OpenAI API key.
- `SPIN_VARIABLE_OPENAI_API_KEY_METHOD` specifies the method to provide the API key. Use `authorization` for OpenAI (default) and `api-key` for Azure OpenAI.
- `SPIN_VARIABLE_REFUND_SIGNING_KEY` an ed21159 secret key that will be used to sign refund requests. You can run the [create-refund-signing-keypair.js](./create-refund-signing-keypair.js) script to create the keypair. Run it using the command `$(node create-refund-signing-keypair.js)` and it will set the environment variable for you.
- `SPIN_VARIABLE_FT_CONTRACT_ID` the NEAR contract account id. e.g `aitoken.test.near`
- `SPIN_VARIABLE_OPENAI_COMPLETIONS_ENDPOINT` OpenAI API completions endpoint. E.g. https://api.openai.com/v1/chat/completions
- `SPIN_VARIABLE_RPC_URL` The NEAR RPC node URL. E.g. https://rpc.mainnet.near.org

Then run the following commands:

```
spin build
spin up
```

This will start the OpenAI proxy server at http://localhost:3000

You can also launch the web client using for example [http-server](https://www.npmjs.com/package/http-server):

```
http-server web
```

You will then find the web client at http://localhost:8080. Here you can have a conversation with the AI model.

# Deploying

## Deploying to Spin cloud

While you can deploy to your own Kubernetes cluster using [spinkube](https://www.spinkube.dev/), the easiest approach, that we will describe here is to deploy to the [Fermyon cloud](https://www.fermyon.com/cloud).

You can find a prebuilt image at the [github registry](https://github.com/petersalomonsen/quickjs-rust-near/pkgs/container/near-ft-openai-proxy), and deploy it using the following command:

```bash
spin deploy -f ghcr.io/petersalomonsen/near-ft-openai-proxy:v0.0.2 --variable refund_signing_key=4FGKKSoRmSVu5q8M1w1fuewJSNwKbM2Cw84EDcz3V2eB --variable ft_contract_id=arizcredits.testnet --variable openai_api_key=sk-Q4QE2pIc4LG_aA --variable rpc_url=https://rpc.testnet.near.org --variable openai_completions_endpoint=https://api.openai.com/v1/chat/completions
```

The variables passed in should be adjusted to your setup. Here's an explanation:

- `refund_signing_key` - This is the signing key used by the AI proxy to sign refund requests. The contract needs the corresponding public key to verify signatures from the AI proxy.
- `ft_contract_id` - This is the Fungible Token contract account id
- `openai_api_key` - The API key for accessing the OpenAI completions endpoint
- `rpc_url` - NEAR RPC node URL
- `openai_completions_endpoint` - The OpenAI chat completion endpoint. Can be any OpenAI API compatible URL

## Setting up the Fungible Token contract

To set up the Fungible Token contract to use with the AI proxy, you need to provide initial supply and metadata. Here is an example of how the "ARIZ" token was set up on the testnet.

```bash
near contract call-function as-transaction arizcredits.testnet new json-args '{"owner_id": "arizcredits.testnet", "total_supply": "9999999999999", "metadata": { "spec": "ft-1.0.0","name": "Ariz credits","symbol": "ARIZ","decimals": 6, "icon": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMjI1IDMyMy4zIDkwIDEwMi45IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDIyNSAzMjMuMyA5MCAxMDIuOTsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6IzM3NDUzNjt9DQoJLnN0MXtmaWxsOiNCREM2QjA7fQ0KCS5zdDJ7ZmlsbDojRjJBMzQxO30NCgkuc3Qze29wYWNpdHk6MC43NTtjbGlwLXBhdGg6dXJsKCNTVkdJRF8wMDAwMDEyNjI5Mzk1Njg3OTY0Mjk2Njk5MDAwMDAwNTIyMTQ4ODk5NTI1NDU0MDQ1NF8pO2ZpbGw6I0NFRDhCRjtlbmFibGUtYmFja2dyb3VuZDpuZXcgICAgO30NCgkuc3Q0e29wYWNpdHk6MC43NTtmaWxsOiNFMEM2NjY7ZW5hYmxlLWJhY2tncm91bmQ6bmV3ICAgIDt9DQoJLnN0NXtvcGFjaXR5OjAuNzU7Y2xpcC1wYXRoOnVybCgjU1ZHSURfMDAwMDAwNzIyNjM4MDU2OTM3MzIwNDg4MTAwMDAwMTU0Mzc2NjQ5ODcwODQ1ODE4MTlfKTtmaWxsOiNDRUQ4QkY7ZW5hYmxlLWJhY2tncm91bmQ6bmV3ICAgIDt9DQoJLnN0NntmaWxsOiNGMkYyRjM7fQ0KCS5zdDd7b3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDg1MjI1MzI1NjAwNDEzOTI3NTIwMDAwMDA2NDcxMjI3Mzc2ODM3Njk2NjY3Xyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7fQ0KCS5zdDh7b3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDQwNTczODM1Mjg3MDI2MTIzNDEwMDAwMDEwMjQzNDkxMDA5NDg5ODI3MjI1Xyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7fQ0KCS5zdDl7ZmlsbDojNDE0NDQyO30NCjwvc3R5bGU+DQo8Zz4NCgk8Zz4NCgkJPGc+DQoJCQk8cGF0aCBjbGFzcz0ic3QxIiBkPSJNMzE0LjcsMzIzLjNWMzk5aC0yMC43di03NS42SDMxNC43eiIvPg0KCQkJPHBvbHlnb24gY2xhc3M9InN0MiIgcG9pbnRzPSIzMTQuNywzMjMuMyAyNDkuNSw0MjYuMiAyMjUsNDI2LjIgMjk0LjEsMzIzLjMgCQkJIi8+DQoJCQk8Zz4NCgkJCQk8Zz4NCgkJCQkJPGRlZnM+DQoJCQkJCQk8cG9seWdvbiBpZD0iU1ZHSURfMDAwMDAwMjc1NzY0MTg5NDYyOTQ0NDcxMzAwMDAwMTY0MzY2NzA2MTc4NzAyOTY0NTlfIiBwb2ludHM9IjMxNC43LDMyMy4zIDI0OS41LDQyNi4yIDIyNSw0MjYuMiANCgkJCQkJCQkyOTQuMSwzMjMuMyAJCQkJCQkiLz4NCgkJCQkJPC9kZWZzPg0KCQkJCQk8Y2xpcFBhdGggaWQ9IlNWR0lEXzAwMDAwMDg0NTA0NjkyOTM2NDA2NjQ3MDAwMDAwMDEwNDAyMDQ3MzI3MjgzNDgxNDgxXyI+DQoJCQkJCQk8dXNlIHhsaW5rOmhyZWY9IiNTVkdJRF8wMDAwMDAyNzU3NjQxODk0NjI5NDQ0NzEzMDAwMDAxNjQzNjY3MDYxNzg3MDI5NjQ1OV8iIHN0eWxlPSJvdmVyZmxvdzp2aXNpYmxlOyIvPg0KCQkJCQk8L2NsaXBQYXRoPg0KCQkJCQk8cGF0aCBzdHlsZT0ib3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDg0NTA0NjkyOTM2NDA2NjQ3MDAwMDAwMDEwNDAyMDQ3MzI3MjgzNDgxNDgxXyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7IiBkPSJNMzE0LjcsMzIzLjNWMzk5aC0yMC43di03NS42SDMxNC43eiIvPg0KCQkJCTwvZz4NCgkJCTwvZz4NCgkJPC9nPg0KCQk8cG9seWdvbiBjbGFzcz0ic3Q0IiBwb2ludHM9IjI5NC4xLDMyMy4zIDI5NC4xLDM1NiAzMTQuNywzMjMuMyAJCSIvPg0KCTwvZz4NCjwvZz4NCjwvc3ZnPg0K"}}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as arizcredits.testnet network-config testnet sign-with-keychain send
```

### Submitting the Javascript code

The special functions for the AI conversation and web4 should be posted as javascript code to the contract. Below is an example taking the content of the files [../fungibletoken/e2e/aiconversation.js](../fungibletoken/e2e/aiconversation.js) and [web4.js](./web4.js).

The first command `yarn aiproxy:web4bundle` takes the `index.html` and `main.js` files in the [web](./web/) folder, bundles it and encodes it as base64 in the `web4_get`function response, resulting in the file `web4.js`.

Note when creating the `JSON_ARGS`, that the `aiconversation.js` and `web4.js` files are concatenated and inserted into the `javascript` property of the function call args. In the file [aiconversation.js](../fungibletoken/e2e/aiconversation.js), there is the placeholder `REPLACE_REFUND_SIGNATURE_PUBLIC_KEY`, which needs to be replaced with the public key corresponding to the signing key passed to the AI proxy above. This replacement is also done in the command snippet below.

```bash
export NETWORK_ID=mainnet
export RPC_URL=https://rpc.mainnet.near.org
export AI_PROXY_BASEURL=https://openai-proxy-zoukmtuw.fermyon.app
export FUNGIBLE_TOKEN_CONTRACT_ID=arizcredits.near
yarn aiproxy:web4bundle
export JSON_ARGS=$(cat ../fungibletoken/e2e/aiconversation.js web4.js | sed "s/REPLACE_REFUND_SIGNATURE_PUBLIC_KEY/${REPLACE_REFUND_SIGNATURE_PUBLIC_KEY}/g" | jq -Rs '{javascript: .}')
near contract call-function as-transaction arizcredits.near post_javascript json-args $JSON_ARGS prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as arizcredits.near network-config mainnet sign-with-keychain send
```

### Updating spin cloud variables

If you need to update e.g. the signing key for refunding, you can update the variable in the spin cloud app like below. Here is an example with a signing key with the contents of the environment variable `SPIN_VARIABLE_REFUND_SIGNING_KEY`.

```bash
spin cloud variables set --app openai-proxy refund_signing_key=$SPIN_VARIABLE_REFUND_SIGNING_KEY
```
