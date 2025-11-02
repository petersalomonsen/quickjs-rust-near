# NFT contract customizable with Javascript

An example of Rust standard NFT contract combined with QuickJS for customizing content and behavior in Javascript.

## An example NFT with its own on-chain hosted web application with a music player

Check out the deployment here: https://webassemblymusic.near.page

The actual example is a music album with 10 tracks, almost 30 minutes of music stored on-chain. No other storage is used. All the web application hosting is also provided by the smart contract from the Javascript code [here](https://github.com/petersalomonsen/quickjs-rust-near/blob/nft/examples/nft/src/contract.js) taking advantage of https://web4.near.page

The music player is a regular web audio element, with the advantage of being able to play even though the device screen is locked. Play from your mobile phone while running, or in the car, or just walking around while the phone screen is locked. Just like a streaming music app, but now also available from a web page. To provide audio for the audio-element it is rendered in a [serviceworker](https://github.com/petersalomonsen/quickjs-rust-near/blob/nft/examples/nft/web4/serviceworker.js) . The music itself is stored in WebAssembly binaries, and when executed in the serviceworker, a wav file is generated on the file and served to the audio element, and then possible to play even on a locked screen.

## Listing NFTs for sale at marketplaces

- Mintbase: https://docs.mintbase.io/dev/smart-contracts/core-addresses/marketplace-2.0#list-a-token ( and https://docs.mintbase.io/~/revisions/Vd6LEzGRFRI5mWC7a3aC/dev/smart-contracts/core-addresses for addresses )
- Paras: https://docs.paras.id/nft-smart-contract-integration#by-nft_approve

### Configuring revenue split

The contract implements Payouts according to [NEP-199](https://nomicon.io/Standards/Tokens/NonFungibleToken/Payout), but what's interesting here is that you can implement generating the Payout structure in Javascript.

Here's an example of a 20 / 80 split between contract owner and NFT owner:

```js
export function nft_payout() {
  const args = JSON.parse(env.input());
  const balance = BigInt(args.balance);
  const payout = {};
  const token_owner_id = JSON.parse(env.nft_token(args.token_id)).owner_id;
  const contract_owner = env.contract_owner();

  const addPayout = (account, amount) => {
    if (!payout[account]) {
      payout[account] = 0n;
    }
    payout[account] += amount;
  };
  addPayout(token_owner_id, (balance * BigInt(80_00)) / BigInt(100_00));
  addPayout(contract_owner, (balance * BigInt(20_00)) / BigInt(100_00));
  Object.keys(payout).forEach((k) => (payout[k] = payout[k].toString()));
  return JSON.stringify({ payout });
}
```

( This is also the actual implementation in the [example contract](./src/contract.js) );

## Understanding Contract Method Invocation Patterns

This contract uses two different patterns for calling JavaScript functions, which is important to understand:

### Pattern 1: Direct Rust Methods (e.g., `nft_mint`)

Some methods like `nft_mint` are **Rust contract methods** that internally call JavaScript functions:

```rust
#[payable]
pub fn nft_mint(&mut self, token_id: TokenId, token_owner_id: AccountId) -> Token {
    let jsmod = self.load_js_bytecode();
    let nft_mint_str = CString::new("nft_mint").unwrap();
    unsafe {
        self.add_js_functions();

        // Call JavaScript function and get metadata
        let mint_metadata_json_string = CStr::from_ptr(js_get_string(js_call_function(
            jsmod,
            nft_mint_str.as_ptr() as i32,
        )) as *const i8)
        .to_str()
        .unwrap();

        // Parse metadata and mint the NFT
        let parsed_json = serde_json::from_str(mint_metadata_json_string);
        let token_metadata: TokenMetadata = parsed_json.unwrap();
        self.tokens
            .internal_mint(token_id, token_owner_id, Some(token_metadata))
    }
}
```

**Key characteristics:**
- ✅ Clients call `nft_mint` **directly** on the Rust contract
- ✅ Rust code internally calls the JavaScript `nft_mint` function
- ✅ JavaScript returns metadata via `env.value_return()`
- ✅ Rust uses the metadata to actually mint the NFT
- ✅ Standard NEP-171 method signature

**Example client call:**
```javascript
// Called directly on the contract
await contract.nft_mint({
  token_id: "nft-001",
  token_owner_id: "alice.near"
}, {
  attachedDeposit: "10000000000000000000000" // 0.01 NEAR
});
```

### Pattern 2: JavaScript Functions via `call_js_func` (e.g., `nft_mint_with_encrypted_content`)

Custom JavaScript functions are called through the generic `call_js_func` method:

```javascript
// Called through call_js_func wrapper
await contract.call_js_func({
  function_name: "nft_mint_with_encrypted_content",
  token_id: "nft-001",
  encrypted_content_base64: "...",
  // ... other parameters
});
```

**Key characteristics:**
- ✅ More flexible - add any custom JavaScript function
- ✅ Called through the `call_js_func` wrapper method
- ✅ JavaScript function receives all parameters directly
- ✅ Perfect for custom business logic
- ✅ No Rust code changes needed for new functions

**When to use each pattern:**
- Use **Pattern 1** (Direct Rust methods) for:
  - Standard NEP-171/177/178 methods
  - Methods that need Rust's NFT storage handling
  - Methods with strict type requirements

- Use **Pattern 2** (`call_js_func`) for:
  - Custom business logic
  - Extended functionality (encrypted content, marketplace, etc.)
  - Rapid prototyping without rebuilding Rust contract
  - Functions that only need JavaScript environment functions

### Important: Return Values

The return method depends on which invocation pattern you're using:

**Pattern 1 (Direct Rust methods)**: Use `return`
```javascript
// ✅ CORRECT - for nft_mint (called directly by Rust)
export function nft_mint() {
  const metadata = {
    title: "My NFT",
    description: "Description"
  };
  return JSON.stringify(metadata); // Use return
}
```

**Pattern 2 (call_js_func)**: Use `env.value_return()`
```javascript
// ✅ CORRECT - for custom functions called through call_js_func
export function nft_mint_with_encrypted_content() {
  const metadata = {
    title: "My NFT",
    description: "Description"
  };
  env.value_return(JSON.stringify(metadata)); // Use env.value_return()
}
```

**Why the difference?**
- Direct Rust methods use QuickJS's native return value mechanism
- `call_js_func` uses NEAR's value return register to pass data back

## Controlling who can mint, and the content

In this contract you should implement the `nft_mint` method in Javascript where you, as you can see from the example below, can control who is able to mint and what content will be minted.

```js
export function nft_mint() {
  if (env.signer_account_id() != env.current_account_id()) {
    env.panic("only contract account can mint");
  }
  const args = JSON.parse(env.input());
  const svgstring = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">
  <rect y="0" width="9" height="3" fill="#0bf"/>
  <rect y="3" width="6" height="3" fill="#f82"/>
  <rect x="6" y="3" width="3" height="3" fill="#333" />
  <rect y="6" width="3" height="3" fill="#2aa"/>
  <rect x="3" y="6" width="6" height="3" fill="#666" />
  <text x="4.5" y="5.5" text-anchor="middle" font-size="3"
          font-family="system-ui" fill="white">
      ${args.token_id}
  </text>
</svg>`;

  return JSON.stringify({
    title: `WebAssembly Music token number #${args.token_id}`,
    description: `An album by Peter Salomonsen with the first generation of tunes made in the browser using the "WebAssembly Music" web application. webassemblymusic.near.page`,
    media: `data:image/svg+xml;base64,${env.base64_encode(svgstring)}`,
    media_hash: env.sha256_utf8_to_base64(svgstring),
  });
}
```

## NFT burn

NFT burning is useful for tickets. The `nft_burn` event is according to standard ( https://nomicon.io/Standards/Tokens/NonFungibleToken/Event#interface ), but not as a method, so market places might not support this from their UI. A simple UI for burning can be found at https://jsinrustnft.near.page/

## Self-contained web-hosting

This NFT contract can also host its own web pages for serving the content using [web4](https://web4.near.page). To do so the `web4_get` method needs to be implemented where you simply write Javascript code to inspect `request.path` in order to determine what web content to render. You can respond with html, js, WebAssembly binaries, images or whatever you want to serve in the web app.

In the example below you see how to check for different paths in the request and respond with various type of content.

```js
export function web4_get() {
  const request = JSON.parse(env.input()).request;

  let response;
  if (request.path == "/serviceworker.js") {
    response = {
      contentType: "application/javascript; charset=UTF-8",
      body: env.get_content_base64(request.path),
    };
  } else if (request.path.indexOf("/musicwasms/") == 0) {
    response = {
      contentType: "application/wasm",
      body: env.get_content_base64(request.path),
    };
  } else if (request.path == "/webassemblymusicsources.zip") {
    if (env.nft_supply_for_owner(request.query.account_id[0]) > 0) {
      const validSignature = env.verify_signed_message(
        request.query.message[0],
        request.query.signature[0],
        request.query.account_id[0],
      );

      if (validSignature) {
        response = {
          contentType: "application/zip",
          body: env.get_content_base64(request.path),
        };
      } else {
        response = {
          contentType: "text/plain",
          body: env.base64_encode("INVALID SIGNATURE"),
        };
      }
    } else {
      response = {
        contentType: "text/plain",
        body: env.base64_encode("NOT OWNER"),
      };
    }
  } else if (request.path == "/icon.svg") {
    response = {
      contentType: "image/svg+xml",
      body: icon_svg_base64,
    };
  } else if (request.path == "/nftowners.json") {
    const tokens = JSON.parse(env.nft_tokens(0, 100));
    response = {
      contentType: "application/json; charset=UTF-8",
      body: env.base64_encode(
        JSON.stringify(
          tokens.map((t) => ({ token_id: t.token_id, owner_id: t.owner_id })),
        ),
      ),
    };
  } else if (request.path.endsWith(".html")) {
    response = {
      contentType: "text/html; charset=UTF-8",
      body: env.get_content_base64(request.path),
    };
  } else {
    response = {
      contentType: "text/html; charset=UTF-8",
      body: env.get_content_base64("/index.html"),
    };
  }
  env.value_return(JSON.stringify(response));
}
```

## Access control

From the `web4_get` snippet above, notice the path `/webassemblymusicsources.zip`. For this particular download, it's made so that only NFT owners can download it. This is done by storing the public key of the owner in a separate contract call:

```js
export function store_signing_key() {
  if (env.nft_supply_for_owner(env.signer_account_id()) > 0) {
    env.store_signing_key(env.block_timestamp_ms() + 24 * 60 * 60 * 1000);
  }
}
```

as you can see only owners can have their sigining keys stored and it will expire after 24 hours.

Then in the view method for downloading the content the user also have to pass in a signed message in the query parameters. If the signature is valid and the account represents an NFT owner then the file will be served for download:

```js
if (env.nft_supply_for_owner(request.query.account_id[0]) > 0) {
  const validSignature = env.verify_signed_message(
    request.query.message[0],
    request.query.signature[0],
    request.query.account_id[0],
  );

  if (validSignature) {
    response = {
      contentType: "application/zip",
      body: env.get_content_base64(request.path),
    };
  } else {
    response = {
      contentType: "text/plain",
      body: env.base64_encode("INVALID SIGNATURE"),
    };
  }
} else {
  response = {
    contentType: "text/plain",
    body: env.base64_encode("NOT OWNER"),
  };
}
```

From the web page calling the contract for storing the signing key and downloading it then looks like this:

```js
downloadSourcesButton.addEventListener("click", async () => {
  const account = walletConnection.account();
  const contract = new Contract(account, contractAccountId, {
    changeMethods: ["call_js_func"],
  });
  const result = await contract.call_js_func({
    function_name: "store_signing_key",
  });

  const message = "hello" + new Date().getTime();

  const keyPair = await account.connection.signer.keyStore.getKey(
    connectionConfig.networkId,
    account.accountId,
  );
  const signature = await keyPair.sign(new TextEncoder().encode(message));
  const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

  const requestQuery = `?message=${encodeURIComponent(message)}&account_id=${encodeURIComponent(account.accountId)}&signature=${encodeURIComponent(signatureBase64)}`;
  const downloadUrl = `https://${contractAccountId}.page/webassemblymusicsources.zip${requestQuery}`;
  const downloadElement = document.createElement("a");
  downloadElement.href = downloadUrl;
  downloadElement.download = "webassemblymusicsources.zip";
  document.documentElement.appendChild(downloadElement);
  downloadElement.click();
  document.documentElement.removeChild(downloadElement);
});
```

See the full implementation in [ownerspage.html](./web4/ownerspage.html)

## Locked content per NFT: Per-token Wasm download with signature verification

This contract supports locking content so that only the owner of a specific NFT can access files or features tied to that NFT. In this example, the contract exposes a dedicated `get_synth_wasm` function, which allows the owner of a specific NFT to download a Wasm file, in this case a synthesizer instrument for use in an Audio Plugin. The particular audio plugin for this example can be found here: https://github.com/petersalomonsen/javascriptmusic/blob/master/dawplugin/

### How it works

- Each NFT owner can store a signing key on the contract, valid for a limited time (e.g., 24 hours).
- To download a Wasm instrument, the user must:
  1. Prove they own the specific NFT (by token ID).
  2. Provide a signed message using their stored signing key.
- The contract verifies both the ownership and the signature before returning the Wasm file.

### Example: Per-NFT locked Wasm download

Suppose you want to allow only the owner of a specific NFT (by token ID) to download a Wasm instrument. The contract will:

1. Check that the `account_id` in the request owns the NFT with the given `token_id`.
2. Verify the provided signature matches the message and the stored signing key for that account.
3. If both checks pass, the Wasm file is returned. Otherwise, access is denied.

#### Example JavaScript (frontend)

```js
// Store signing key (must be called by the NFT owner)
await contract.call_js_func({
  function_name: "store_signing_key",
  args: { token_id },
});

// Prepare message and signature for download
const message = JSON.stringify({ token_id });
const keyPair = await account.connection.signer.keyStore.getKey(
  connectionConfig.networkId,
  account.accountId,
);
const signatureObj = await keyPair.sign(new TextEncoder().encode(message));
const signature = btoa(String.fromCharCode(...signatureObj.signature));

// Call the contract to get the Wasm file
const wasmBase64 = await contract.call_js_func({
  function_name: "get_synth_wasm",
  message,
  account_id: account.accountId,
  signature,
});

// Decode and use the Wasm file as needed
```

#### Example contract logic (JavaScript)

```js
export function get_synth_wasm({ message, account_id, signature }) {
  // Parse the message to get the token_id
  const { token_id } = JSON.parse(message);

  // Check ownership
  if (env.nft_supply_for_owner_token(account_id, token_id) > 0) {
    // Verify signature
    const validSignature = env.verify_signed_message(
      message,
      signature,
      account_id,
    );
    if (validSignature) {
      // Return the Wasm file (as base64)
      return env.get_content_base64(`musicwasms/${token_id}.wasm`);
    } else {
      return "invalid signature";
    }
  } else {
    return "not owner";
  }
}
```

This approach ensures that only the owner of a specific NFT can access its associated Wasm instrument, and that access is cryptographically verified for each request. This is especially useful for integrating with external tools (like the audio plugin mentioned above) that need to securely fetch Wasm content per NFT.

## Encrypted Content with Zero-Knowledge Proofs

This contract also supports NFTs with **encrypted content** where ownership transfers include **cryptographic proof** that the new owner receives the correct decryption key. This enables secure transfer of access to encrypted digital assets without revealing secrets.

### Use Cases

#### 1. On-Chain Encrypted Content
Store encrypted content directly in the NFT:
- **Best for:** Metadata, configuration, short text, small files
- **Storage:** Content encrypted with AES-256-GCM stored in contract
- **Key:** AES key encrypted with owner's Ristretto255 public key (ElGamal)

#### 2. Off-Chain Content with On-Chain Encrypted Keys
Store large content off-chain but keep decryption key on-chain:
- **Best for:** Large files (images, videos, music, documents)
- **Storage:** Encrypted content on IPFS/Arweave/etc.
- **Key:** Only the encrypted AES key stored on-chain
- **Example:** Music NFT where encrypted MP3 is on IPFS, but decryption key is on-chain

### How It Works

The system uses a combination of cryptographic primitives:

1. **Ristretto255 ElGamal Encryption** - For transferring keys between owners
2. **AES-256-GCM** - For encrypting the actual content
3. **Zero-Knowledge Proofs** - For proving correct re-encryption during transfer

#### Key Derivation Flow

```
secret_scalar (random 32 bytes)
    ↓
secret_point = secret_scalar * G  (Ristretto255 point)
    ↓
aes_key = SHA256(secret_point)  (32-byte AES key)
    ↓
encrypted_content = AES-GCM(content, aes_key)
```

The key insight: The AES key is **derived** from a point on the elliptic curve, which allows:
- Encrypting the `secret_scalar` using ElGamal (for the owner's public key)
- Owner decrypts to get `secret_point` directly (exponential ElGamal)
- Owner derives the same AES key via `Hash(secret_point)`

### Transfer Protocol

When transferring an NFT with encrypted content:

1. **Buyer initiates purchase** via `nft_transfer_payout`
   - NFT ownership changes
   - Payment held in escrow

2. **Seller retrieves buyer's public key** from contract
   ```javascript
   const buyer_pubkey = await contract.get_encryption_pubkey({
     account_id: buyer
   });
   ```

3. **Seller re-encrypts for buyer** (off-chain)
   ```javascript
   const new_ciphertext = elgamalEncrypt(secret_scalar, buyer_pubkey);
   ```

4. **Seller generates zero-knowledge proof** (off-chain)
   ```javascript
   const proof = generateReencryptionProof(
     secret_scalar,
     old_ciphertext_c1, old_ciphertext_c2,
     old_randomness, old_pubkey,
     new_ciphertext_c1, new_ciphertext_c2,
     new_randomness, buyer_pubkey
   );
   ```

5. **Seller submits proof** to finalize transfer
   ```javascript
   await contract.finalize_reencryption({
     token_id,
     new_ciphertext_c1_base64,
     new_ciphertext_c2_base64,
     proof: {
       commit_r_old_base64,
       commit_s_old_base64,
       commit_r_new_base64,
       commit_s_new_base64,
       response_s_base64,      // Proves same secret!
       response_r_old_base64,
       response_r_new_base64
     }
   });
   ```

6. **Contract verifies proof on-chain**
   - Uses Rust Ristretto255 operations
   - Verifies both ciphertexts encrypt the same `secret_scalar`
   - Updates stored ciphertext for new owner
   - Releases escrow payment

7. **Buyer retrieves and decrypts**
   ```javascript
   const data = await contract.get_encrypted_content_data({ token_id });
   const secret_point = elgamalDecrypt(
     data.elgamal_ciphertext,
     buyer_privkey
   );
   const aes_key = SHA256(secret_point);
   const content = AES_GCM_decrypt(data.encrypted_content, aes_key);
   ```

### Zero-Knowledge Proof Guarantees

The ZK proof ensures:
- ✅ **Correctness**: Buyer receives the same secret as seller had
- ✅ **Zero-knowledge**: Secret never revealed during transfer
- ✅ **Non-interactive**: Seller generates proof alone (Fiat-Shamir heuristic)
- ✅ **Publicly verifiable**: Anyone can verify the proof on-chain
- ✅ **Trustless**: No need to trust the seller

#### What the Proof Proves

The proof cryptographically guarantees that:
```
old_ciphertext and new_ciphertext encrypt the SAME secret_scalar
```

Without revealing:
- The `secret_scalar` itself
- The `secret_point`
- The AES key
- The randomness used in encryption

This is done using a Sigma protocol with Fiat-Shamir transform, verified on-chain using the Rust `curve25519-dalek` library.

### Gas Costs

All gas costs measured using NEAR Sandbox (real NEAR network running locally):

| Operation | Gas Cost (TGas) | Notes |
|-----------|-----------------|-------|
| Register encryption public key | ~3 TGas | One-time per account |
| Mint encrypted NFT | ~15 TGas | Includes storage |
| Initiate transfer | ~5 TGas | Creates escrow |
| **Finalize + ZK proof verification** | **~35 TGas** | **Most expensive** |
| Retrieve encrypted content | ~1 TGas | View call (free) |

**Key insight:** The ZK proof verification (~30 TGas) is the most expensive operation, but it's well within NEAR's 300 TGas block limit.

**Storage costs:** Depend on content size for on-chain storage. For off-chain content (IPFS/Arweave), only the encrypted 32-byte AES key is stored on-chain.

### Security Features

#### Attack Prevention

| Attack | How Prevented |
|--------|---------------|
| Seller sends wrong key | ZK proof verification fails, transfer blocked |
| Seller reuses old proof | Proof includes specific ciphertext hashes |
| Replay attack | Proof tied to specific token_id and escrow |
| Man-in-the-middle | Public keys registered on-chain |
| Malicious buyer doesn't pay | Escrow holds payment until proof verified |
| Malicious seller doesn't re-encrypt | Buyer can cancel and get refund |

#### Key Management

⚠️ **CRITICAL:** Users must securely store their Ristretto255 private keys
- Private keys cannot be recovered if lost
- Losing a private key means **permanent loss** of access to encrypted content
- Consider implementing:
  - Social recovery mechanisms
  - Key backup procedures
  - Multi-signature schemes

### Example: Encrypted Music NFT with IPFS

```javascript
// 1. Artist generates encryption keys
const artist_privkey = crypto.randomBytes(32);
const artist_scalar = bufferToScalar(artist_privkey);
const artist_pubkey = RistrettoPoint.BASE.multiply(artist_scalar);

// 2. Artist creates secret and derives AES key
const secret_scalar = crypto.randomBytes(32);
const secret_point = RistrettoPoint.BASE.multiply(bufferToScalar(secret_scalar));
const aes_key = crypto.createHash('sha256')
  .update(Buffer.from(secret_point.toRawBytes()))
  .digest();

// 3. Artist encrypts music file
const music_file = await fs.readFile('song.mp3');
const encrypted_music = encryptAES_GCM(music_file, aes_key);

// 4. Upload encrypted music to IPFS
const ipfs_cid = await ipfs.add(encrypted_music);

// 5. Encrypt secret_scalar for artist's public key
const artist_ciphertext = elgamalEncrypt(secret_scalar, artist_pubkey);

// 6. Mint NFT with IPFS reference and encrypted key
await contract.nft_mint_with_encrypted_content({
  token_id: "song-001",
  receiver_id: "artist.near",
  encrypted_content_base64: ipfs_cid, // Store IPFS CID
  elgamal_ciphertext_c1_base64: artist_ciphertext.c1,
  elgamal_ciphertext_c2_base64: artist_ciphertext.c2,
  owner_pubkey_base64: Buffer.from(artist_pubkey.toRawBytes()).toString('base64')
});

// 7. Fan purchases NFT
await contract.nft_transfer_payout({
  receiver_id: "fan.near",
  token_id: "song-001",
  balance: "10000000000000000000000000" // 10 NEAR
});

// 8. Artist re-encrypts for fan and proves
const fan_pubkey = await contract.get_encryption_pubkey({ account_id: "fan.near" });
const fan_ciphertext = elgamalEncrypt(secret_scalar, fan_pubkey);
const proof = generateReencryptionProof(
  secret_scalar,
  artist_ciphertext.c1, artist_ciphertext.c2,
  artist_randomness, artist_pubkey,
  fan_ciphertext.c1, fan_ciphertext.c2,
  fan_randomness, fan_pubkey
);

await contract.finalize_reencryption({
  token_id: "song-001",
  new_ciphertext_c1_base64: fan_ciphertext.c1,
  new_ciphertext_c2_base64: fan_ciphertext.c2,
  proof
});

// 9. Fan downloads from IPFS and decrypts
const nft_data = await contract.get_encrypted_content_data({
  token_id: "song-001"
});

// Decrypt ElGamal to get secret_point
const secret_point_recovered = elgamalDecrypt(
  nft_data.elgamal_ciphertext,
  fan_privkey
);

// Derive AES key
const aes_key_recovered = crypto.createHash('sha256')
  .update(secret_point_recovered)
  .digest();

// Download from IPFS (CID stored in encrypted_content_base64)
const ipfs_cid = nft_data.encrypted_content_base64;
const encrypted_music = await ipfs.cat(ipfs_cid);

// Decrypt music file
const music_file = decryptAES_GCM(encrypted_music, aes_key_recovered);

// Fan can now play the music!
await audioPlayer.play(music_file);
```

### API Reference

#### `register_encryption_pubkey(pubkey_base64: string)`
Register your Ristretto255 public key (32 bytes, base64-encoded).

**Gas:** ~3 TGas
**Storage:** ~0.001 NEAR

#### `get_encryption_pubkey(account_id: string) → {pubkey_base64: string}`
Retrieve registered public key for an account.

**Gas:** ~1 TGas (view call)

#### `nft_mint_with_encrypted_content(...)`
Mint NFT with encrypted content.

**Parameters:**
- `token_id`: Unique NFT identifier
- `receiver_id`: Initial owner
- `encrypted_content_base64`: Encrypted content OR IPFS CID
- `encrypted_scalar_base64`: Encrypted secret_scalar (for proof generation)
- `elgamal_ciphertext_c1_base64`: ElGamal C1 component
- `elgamal_ciphertext_c2_base64`: ElGamal C2 component
- `owner_pubkey_base64`: Owner's public key

**Gas:** ~15 TGas
**Storage:** ~0.02 NEAR (depends on content size)

#### `get_encrypted_content_data(token_id: string) → object`
Retrieve encrypted content and ciphertext.

**Returns:**
```javascript
{
  encrypted_content_base64: string,  // Content or IPFS CID
  encrypted_scalar_base64: string,
  elgamal_ciphertext: {
    c1_base64: string,
    c2_base64: string
  },
  owner_pubkey: string
}
```

**Gas:** ~1 TGas (view call)

#### `finalize_reencryption(...)`
Complete transfer with ZK proof verification.

**Parameters:**
- `token_id`: NFT identifier
- `new_ciphertext_c1_base64`: Re-encrypted C1
- `new_ciphertext_c2_base64`: Re-encrypted C2
- `proof`: ZK proof object (7 components)

**Gas:** ~35 TGas (includes proof verification)

### Testing

Run the comprehensive E2E test suite:

```bash
# From repository root
yarn install
yarn test-examples-nft-e2e
```

Or run the test directly:

```bash
# From repository root
yarn install
cd examples/nft && ./build.sh && node --test e2e/*
```

**Test coverage:**
- ✅ Ristretto255 keypair generation
- ✅ Encryption key registration
- ✅ AES-256-GCM content encryption
- ✅ Exponential ElGamal encryption
- ✅ NFT minting with encrypted content
- ✅ Content retrieval and decryption
- ✅ NFT transfer with re-encryption
- ✅ **Zero-knowledge proof generation**
- ✅ **On-chain ZK proof verification**
- ✅ New owner content access

All tests run against NEAR Sandbox (real NEAR network), validating actual gas costs and on-chain behavior.

### Client Implementation

The E2E test file (`e2e/encrypted-nft-sandbox.test.js`) provides a complete reference implementation for:
- Key generation using `@noble/curves`
- ElGamal encryption/decryption
- AES-256-GCM content encryption
- ZK proof generation (Sigma protocol + Fiat-Shamir)
- Contract interaction

**Dependencies:**
```bash
npm install @noble/curves
```

### Production Considerations

#### ✅ Validated in Sandbox

- Gas costs measured with real NEAR network
- Cryptographic primitives are correct
- ZK proof verification works on-chain
- E2E tests pass comprehensively

#### ⚠️ Before Mainnet Deployment

1. **Professional Security Audit**
   - ZK proof implementation review
   - Key management best practices
   - Smart contract access control

2. **User Key Management**
   - Document key backup procedures
   - Implement key recovery mechanisms
   - Provide secure key storage libraries

3. **Additional Features**
   - Escrow expiration timeouts
   - Storage deposit accounting
   - Enhanced error messages
   - Event logging for transfers

### References

- **Ristretto255**: https://ristretto.group/
- **ElGamal Encryption**: https://en.wikipedia.org/wiki/ElGamal_encryption
- **Sigma Protocols**: https://zkproof.org/
- **@noble/curves**: https://github.com/paulmillr/noble-curves
- **NEAR Sandbox**: https://docs.near.org/tools/sandbox

---

**⚠️ Security Notice:** This system handles cryptographic keys. Users are responsible for securely storing their private keys. Lost keys cannot be recovered.
