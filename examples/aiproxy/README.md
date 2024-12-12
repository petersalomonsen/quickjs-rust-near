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
