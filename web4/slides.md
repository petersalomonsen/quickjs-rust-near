Javascript inside Rust smart contract
=====================================
<center>Peter Salomonsen @ NEARCON 2022</center>

------

# What?

- QuickJS embeddable JS runtime inside Rust smart contract
- Smart contract allowing users to post and run their own JS

------

# Why?

- Extend a smart contract with user defined policies
- Not just user supplied content, but also functionality
- Embed into Rust contract to provide a secure execution environment

------

# How?

- Created a simple wrapper lib in C on top of QuickJS
- Compile to Wasm for simulation in the browser
  - https://github.com/petersalomonsen/quickjs-wasm-near
- Link into Rust for embedding into smart contract
  - https://github.com/petersalomonsen/quickjs-rust-near

------

# Challenges

- Testing
  - Run NEAR Rust SDK tests in WebAssembly runtime
  - Otherwise we also would have to provide linked libraries for host platform
  - Solved by mocking a minimum NEAR environment
  
------

# Demo

- Music written in Javascript from the WebAssembly Music project
- Paste into smart contract (web4) UI
- Generate music on-chain
- Evaluate user args from JS
- Even require a signed transaction
  
------

# Extra demo

- A special twist of the NEAR-JS-SDK
- Write JS smart contract in the Web browser
- No servers involved (no access keys sent to any server)
- Simulation running in Wasm in the browser
- Deploy from the browser

------

# THANK YOU