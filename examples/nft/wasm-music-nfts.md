# WebAssembly Music instrument plugin NFTs

I wouldn't be surprised if most musical instruments sold today are digital. Before computers were capable of playing complex instruments in real time, we could buy a synthesizer as in a dedicated hardware box, and connect it to our MIDI keyboard or sequencer. Now we get that box as a plugin that we can load into our computer, and when we play the connected keyboard, the sounds of that instrument will be generated in real time.

WebAssembly Music is about turning the web browser into such a host for digital musical instruments. WebAssembly is a file format for computer programs that can run in the browser. By implementing the musical instrument plugin in this file format, the web browser can run it. The web browser can receive messages from your MIDI keyboard and send them to the WebAssembly Music instrument, and then we have everything needed to play.

# WebAssembly Music synths

A digital music instrument can be created from mathematic formulas that computes the points in a soundwave. Complex and even natural sounding instruments can be implemented through math expressed in computer program code. The idea behind the WebAssembly Music project is to avoid recording sounds, but rather implement all the algorithms and math to render the instrument audio output in real time. This way it is possible to create very small Wasm files, in less than 50 kb, which opens up for new ways of distribution.

# Using the WebAssembly Music synth in a DAW

Wasm is not a file format used by DAWs like Logic, Cubase, Reaper and similar applications. They normally use plugin formats like VSTi or Audio Unit instruments. The WebAssembly Music project has a [DAW plugin](https://github.com/petersalomonsen/javascriptmusic/tree/master/dawplugin) that will connect to these apps and allow you to load Wasm files. This plugin contains a WebAssembly Runtime for playing the WebAssembly Music instrument.

# Distributing musical instrument plugins

With WebAssembly Music, we can distribute instruments plugins as easy as sending the Wasm file. A 50 kb file can easily be sent through messaging, mail, and also it does not cost much to host through web storage either.

Creators of digital music synthesizers would still have an interest to monetize from their work. They may set up a web shop for this purpose, where the user can download the synth after payment. With the small size WebAssembly files this would be cheap hosting when it comes to storage of the content, but you would still need to protect it through a payment gate, and for registered users. And even when the Wasm file is downloaded, there is no track of re-distributions and re-sales.

# Storing the Wasm files on-chain

Since the Wasm files are tiny, it is possible to store it on a blockchain within reasonable cost. Blockchain is excellent for tracking ownership and re-sales of a specific Wasm file, but since everything stored on-chain is public for anyone to inspect, the Wasm file would also be accessible for anyone to download. To solve this, the Wasm file could also be stored off-chain, with an access control gateway checking that the user who wants to download it is the owner of it. The downside of off-chain storage is that the vendor would be responsible for keeping it available for the end users at all times.

To ensure that the Wasm synth, the digital asset, is available to the owner at all times, the blockchain is the best provider of such availability. For only the owner to be able to access it, it needs to be encrypted, and only the owner should posess the key. If the owner wants to sell the asset, it has to be re-encrypted for the new owner.

Re-encryption raises the challenge of ensuring that the seller encrypts the correct content. The seller should not get paid before the goods are delivered, and the buyer should not get the goods before paying. An escrow can solve this, but then it is still the problem of getting the confirmation that the content will be accessible for the new owner. The seller may encrypt the content for the buyer, but the buyer may not confirm. In a world-wide market chances of resolving disputes may be very low. The escrow must have the possibility to verify that the seller has delivered, but the escrow should not be able to see the content. The seller must provide a proof of having delivered the content, without revealing the content.

# The Re-encryption Flow

```
1. Mint NFT
   [Wasm File] → Encrypt with AES → [Encrypted Wasm] (stored on-chain)
                                     + [Secret Key encrypted for Seller]

2. List for Sale
   [NFT Listed at Price] → Buyer purchases → [Funds in Escrow]

3. Seller Re-encrypts
   [Secret Key] → Re-encrypt for Buyer → [New Encrypted Secret]
                → Generate Proof → [Zero-Knowledge Proof]

4. Contract Verifies
   [Proof] → Verify (4 equations) → ✅ Same secret confirmed
          → Release funds to Seller
          → Buyer can now decrypt and access Wasm
```

# Zero-knowledge proof

The seller needs to prove that the content now has been encrypted with buyers public key. Actually, instead of re-encryption of the actual content, we will re-encrypt the secret that allows decryption of the on-chain Wasm instrument plugin. The hash checksum of this secret is known at minting time. The seller needs to prove that it is this secret that is re-encrypted for the buyer.

The seller can provide a proof where all the public information (the public keys of the seller and buyer, the encrypted version of the secret for the seller and for the buyer) with some random numbers added, is hashed together as a challenge, and a response that consists of **masked values** - the actual secrets **mixed with** the random numbers - so the secret stays hidden but the math can be verified.

The escrow contract can verify the proof by checking that the responses match the challenges using the same public information. **Crucially, the SAME response value appears in equations for both the old and new encrypted versions, proving they contain the same secret.** The secret itself is never revealed - it remains protected by the random masking values, but the mathematical relationship proves both encryptions are of the identical secret.

When the escrow contract has verified the proof, it can release the funds to the seller, without getting any further confirmation from the buyer.

The buyer can now download the encrypted content, which in this case is the synth Wasm file. This Wasm file can be loaded into the DAW.
