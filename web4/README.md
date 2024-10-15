# Web4 and a WebAssembly Music showcase

The web application in the [web4](./web4) folder is a vanilla JS Web Component application for uploading music written in Javascript and also playing it, and accepting parameters in JSON for configuring the playback. It also contains functionality for exporting to WAV. See the video playlist above for a demo.

The music to be played back is fetched in a view method call, and for controlling who can access this view method the JSON parameters payload is signed using the callers private key. The contract will then verify the signature according to the callers public key stored in a transaction before the view method call.

The web application is packaged into a single HTML file using rollup, where the final bundle is embedded into the Rust sources encoded as a base64 string.
