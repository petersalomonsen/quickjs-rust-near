Rust WebAssembly smart contracts for NEAR with Javascript runtime
================================================================

This project shows compiling and embedding [QuickJS](https://bellard.org/quickjs/) with https://github.com/near/near-sdk-rs for being able to execute custom JavaScript code inside a smart contract written in Rust. It contains examples of standard contracts like NFT and Fungible token, with JavaScript customization layers on top. There are also examples of a [web4](https://github.com/vgrichina/web4) contract.

Check out the youtube playlist with videos showing the project:

https://www.youtube.com/watch?v=JBZEr__pid0&list=PLv5wm4YuO4IwVNrSsYxeqKrtQZYRML03Z

Also check out the [end-to-end](#end-to-end-tests-using-near-workspaces) tests for how to use the contracts from this project.

# Purpose / NEAR ecosystem impact

The purpose of the project is to provide an example and starting point for adding the Javascript layer in Rust smart contracts. Being able to execute custom Javascript code makes it possible to configure behaviour of Rust smart contracts in a dynamic way through code, and not just JSON configuration. My own motivation was to run Javascript music code inside a smart contract ( see the [WebAssembly Music](https://github.com/petersalomonsen/javascriptmusic) project), and then I also saw this [tweet](https://x.com/ilblackdragon/status/1561368373618941954) that the combination of Javascript and Rust WebAssembly was needed for other projects in the NEAR ecosystem too.

Since this project has examples for various Rust standard smart contracts on NEAR, the desired impact for projects in the NEAR ecosystem is to use these in their smart contract implementations. The combination of a customizable javascript layer on top of a rock solid Rust smart contract aims to provide flexibility without sacrificing robustness. The project also shows you how to use testing framework to ensure full End to End tests of the use cases. A comprehensive example of this is the OpenAI proxy using Fungible Tokens for covering usage costs ( see list of examples below ).

# Devcontainer / github actions

All the pre-requisities for getting the project up and running can be found in the [.devcontainer](./.devcontainer) folder, which will be automaticall set up if using a github codespace.

The github actions also shows how to build and run all the examples.

# Architecture / structure

QuickJS is built with [Emscripten](https://emscripten.org/) to a static library. Another C library, which can be found in the [quickjslib](./quickjslib/) folder, is providing a simplified interface to QuickJS, which is then linked to the Rust code along with other relevant static libraries from the Emscripten distribution ( such as the C standard library, allocator, WASI etc. ).

See the entire build process in [build.rs](./build.rs).

In the Rust part, there are contract implementations exposing functions for submitting JavaScript code. Both in the internal bytecode format of QuickJS, and pure JS source code.

# Unit tests running in WebAssembly

While it's common and more straightforward for NEAR smart contracts and many other Rust WebAssembly projects, to have their unit tests compiled to the native platform, this project runs the unit test in a WebAssembly runtime. The reason for this is because of the static libraries compiled from C, which are already targeting Wasm. One limitation when running tests inside the Wasm runtime is that you cannot catch panics, and so testing the error messages has to be done in the end-2-end tests

# End-to-end tests using near-workspaces

In the [e2e](./e2e/) folder and also within the [examples](./examples/) folders there are test files that demonstrates deployment and interaction with the contract using [near-workspaces-js](https://github.com/near/near-workspaces-js). All these tests are being run as part of the github actions pipeline, but you can also look at this for examples on how to use the contracts produced in this project.

# Local JS test environment

A simple mocking of NEAR interfaces for simulation of a smart contract directly in NodeJS or in the browser can be found in [localjstestenv](./localjstestenv/README.md).

# Example contracts

- [NFT](./examples/nft/README.md) - The standard NFT contract, customizable with JavaScript
- [Fungible Token](./examples/fungibletoken/README.md) - The standard FT contract, customizable with JavaScript
- [OpenAI proxy](./examples/aiproxy/REAdME.md) - A proxy to an OpenAI API server interacting with the Fungible Token contract for covering usage costs
- [Minimum Web4](./examples/minimumweb4/README.md) - Implement the web4 interface in JavaScript to serve a website from the smart contract
- "[PureJS](./examples/purejs/README.md)" - Precompile the JS bytecode into the contract, and provide direct exports to the JS functions.
- [Web4 and a WebAssembly Music showcase](./web4/README.md) - JavaScript from WebAssembly Music running in the smart contract

# Goals and roadmap

The project has already fulfilled the goal of compiling QuickJS to WebAssembly and integrate with a Rust smart contract. There is also a proof-of-concept Fungible Token contract integrated with a proxy to an OpenAI API. The goals ahead is to support the live implementations of this into the [WebAssembly Music](https://github.com/petersalomonsen/javascriptmusic) project and [Ariz portfolio](https://github.com/arizas/near-account-report).

Integrating with NEAR AI is also a natural next step in the evolution. Today NEAR AI is accessible by smarts contract emitting events, and with the Javascript layer provided here, it is possible to provide such events in a more dynamic way. The logic to generate the events can be altered without having to redeploy the entire smart contract, and also using function access keys instead of full access keys.

Finally, for the project to get more attention, it needs more documentation. Even though it already contains comprehensive test cases that also serves as code examples, the documentation explaining the concepts can be developed even more.

This are all goals ahead for 2025.