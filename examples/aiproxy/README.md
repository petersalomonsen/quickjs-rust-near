# AI Proxy

This folder contains a [Spin](https://www.fermyon.com/spin) application, based on the WASI 2 and the WebAssembly Component Model ( https://component-model.bytecodealliance.org/ ). It is implemented in Rust as a serverless proxy for the OpenAI API.

There is a simple example of a web client in the [web](./web/) folder.

The application will keep track of of token usage per conversation in the built-in key-value storage of Spin. The initial balance for a conversation is retrieved from the Fungible Token smart contract.

To launch the application, make sure to have the Spin SDK installed. Set the environment variable `SPIN_VARIABLE_OPENAI_API_KEY` to your OpenAI API key.

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

# Setting up the Fungible Token contract

To set up the Fungible Token contract to use with the AI proxy, you need to provide initial supply and metadata. Here is an example of how the "ARIZ" token was set up on the testnet.

```bash
near contract call-function as-transaction arizcredits.testnet new json-args '{"owner_id": "arizcredits.testnet", "total_supply": "9999999999999", "metadata": { "spec": "ft-1.0.0","name": "Ariz credits","symbol": "ARIZ","decimals": 6, "icon": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMjI1IDMyMy4zIDkwIDEwMi45IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDIyNSAzMjMuMyA5MCAxMDIuOTsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6IzM3NDUzNjt9DQoJLnN0MXtmaWxsOiNCREM2QjA7fQ0KCS5zdDJ7ZmlsbDojRjJBMzQxO30NCgkuc3Qze29wYWNpdHk6MC43NTtjbGlwLXBhdGg6dXJsKCNTVkdJRF8wMDAwMDEyNjI5Mzk1Njg3OTY0Mjk2Njk5MDAwMDAwNTIyMTQ4ODk5NTI1NDU0MDQ1NF8pO2ZpbGw6I0NFRDhCRjtlbmFibGUtYmFja2dyb3VuZDpuZXcgICAgO30NCgkuc3Q0e29wYWNpdHk6MC43NTtmaWxsOiNFMEM2NjY7ZW5hYmxlLWJhY2tncm91bmQ6bmV3ICAgIDt9DQoJLnN0NXtvcGFjaXR5OjAuNzU7Y2xpcC1wYXRoOnVybCgjU1ZHSURfMDAwMDAwNzIyNjM4MDU2OTM3MzIwNDg4MTAwMDAwMTU0Mzc2NjQ5ODcwODQ1ODE4MTlfKTtmaWxsOiNDRUQ4QkY7ZW5hYmxlLWJhY2tncm91bmQ6bmV3ICAgIDt9DQoJLnN0NntmaWxsOiNGMkYyRjM7fQ0KCS5zdDd7b3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDg1MjI1MzI1NjAwNDEzOTI3NTIwMDAwMDA2NDcxMjI3Mzc2ODM3Njk2NjY3Xyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7fQ0KCS5zdDh7b3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDQwNTczODM1Mjg3MDI2MTIzNDEwMDAwMDEwMjQzNDkxMDA5NDg5ODI3MjI1Xyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7fQ0KCS5zdDl7ZmlsbDojNDE0NDQyO30NCjwvc3R5bGU+DQo8Zz4NCgk8Zz4NCgkJPGc+DQoJCQk8cGF0aCBjbGFzcz0ic3QxIiBkPSJNMzE0LjcsMzIzLjNWMzk5aC0yMC43di03NS42SDMxNC43eiIvPg0KCQkJPHBvbHlnb24gY2xhc3M9InN0MiIgcG9pbnRzPSIzMTQuNywzMjMuMyAyNDkuNSw0MjYuMiAyMjUsNDI2LjIgMjk0LjEsMzIzLjMgCQkJIi8+DQoJCQk8Zz4NCgkJCQk8Zz4NCgkJCQkJPGRlZnM+DQoJCQkJCQk8cG9seWdvbiBpZD0iU1ZHSURfMDAwMDAwMjc1NzY0MTg5NDYyOTQ0NDcxMzAwMDAwMTY0MzY2NzA2MTc4NzAyOTY0NTlfIiBwb2ludHM9IjMxNC43LDMyMy4zIDI0OS41LDQyNi4yIDIyNSw0MjYuMiANCgkJCQkJCQkyOTQuMSwzMjMuMyAJCQkJCQkiLz4NCgkJCQkJPC9kZWZzPg0KCQkJCQk8Y2xpcFBhdGggaWQ9IlNWR0lEXzAwMDAwMDg0NTA0NjkyOTM2NDA2NjQ3MDAwMDAwMDEwNDAyMDQ3MzI3MjgzNDgxNDgxXyI+DQoJCQkJCQk8dXNlIHhsaW5rOmhyZWY9IiNTVkdJRF8wMDAwMDAyNzU3NjQxODk0NjI5NDQ0NzEzMDAwMDAxNjQzNjY3MDYxNzg3MDI5NjQ1OV8iIHN0eWxlPSJvdmVyZmxvdzp2aXNpYmxlOyIvPg0KCQkJCQk8L2NsaXBQYXRoPg0KCQkJCQk8cGF0aCBzdHlsZT0ib3BhY2l0eTowLjc1O2NsaXAtcGF0aDp1cmwoI1NWR0lEXzAwMDAwMDg0NTA0NjkyOTM2NDA2NjQ3MDAwMDAwMDEwNDAyMDQ3MzI3MjgzNDgxNDgxXyk7ZmlsbDojQ0VEOEJGO2VuYWJsZS1iYWNrZ3JvdW5kOm5ldyAgICA7IiBkPSJNMzE0LjcsMzIzLjNWMzk5aC0yMC43di03NS42SDMxNC43eiIvPg0KCQkJCTwvZz4NCgkJCTwvZz4NCgkJPC9nPg0KCQk8cG9seWdvbiBjbGFzcz0ic3Q0IiBwb2ludHM9IjI5NC4xLDMyMy4zIDI5NC4xLDM1NiAzMTQuNywzMjMuMyAJCSIvPg0KCTwvZz4NCjwvZz4NCjwvc3ZnPg0K"}}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as arizcredits.testnet network-config testnet sign-with-keychain send
```

### Submitting the Javascript code

The special functions for the AI conversation and web4 should be posted as javascript code to the contract. Here's an example taking the content of the files [../fungibletoken/e2e/aiconversation.js](../fungibletoken/e2e/aiconversation.js) and [web4.js](./web4.js).

```bash
yarn aiproxy:web4bundle
near contract call-function as-transaction arizcredits.testnet post_javascript json-args "$(cat ../fungibletoken/e2e/aiconversation.js web4.js |jq -Rs '{javascript: .}')" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as arizcredits.testnet network-config testnet sign-with-keychain send
```

