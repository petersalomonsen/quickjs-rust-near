NFT contract customizable with Javascript
=========================================

An example of Rust standard NFT contract combined with QuickJS for customizing content and behavior in Javascript.

Check out the deployment here: https://webassemblymusic.near.page

The actual example is a music album with 10 tracks, almost 30 minutes of music stored on-chain. No other storage is used. All the web application hosting is also provided by the smart contract from the Javascript code [here]( https://github.com/petersalomonsen/quickjs-rust-near/blob/nft/examples/nft/src/contract.js) taking advantage of https://web4.near.page

The music player is a regular web audio element, with the advantage of being able to play even though the device screen is locked. Play from your mobile phone while running, or in the car, or just walking around while the phone screen is locked. Just like a streaming music app, but now also available from a web page. To provide audio for the audio-element it is rendered in a [serviceworker](https://github.com/petersalomonsen/quickjs-rust-near/blob/nft/examples/nft/web4/serviceworker.js) . The music itself is stored in WebAssembly binaries, and when executed in the serviceworker, a wav file is generated on the file and served to the audio element, and then possible to play even on a locked screen.

## Listing NFTs for sale at marketplaces

- Mintbase: https://docs.mintbase.io/dev/smart-contracts/core-addresses/marketplace-2.0#list-a-token ( and https://docs.mintbase.io/~/revisions/Vd6LEzGRFRI5mWC7a3aC/dev/smart-contracts/core-addresses for addresses )
- Paras: https://docs.paras.id/nft-smart-contract-integration#by-nft_approve
