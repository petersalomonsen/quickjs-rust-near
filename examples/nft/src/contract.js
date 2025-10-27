const icon_svg_base64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDkiPgogICAgPHJlY3QgeT0iMCIgd2lkdGg9IjkiIGhlaWdodD0iMyIgZmlsbD0iIzBiZiIvPgogICAgPHJlY3QgeT0iMyIgd2lkdGg9IjYiIGhlaWdodD0iMyIgZmlsbD0iI2Y4MiIvPgogICAgPHJlY3QgeD0iNiIgeT0iMyIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzMzMyIgLz4KICAgIDxyZWN0IHk9IjYiIHdpZHRoPSIzIiBoZWlnaHQ9IjMiIGZpbGw9IiMyYWEiLz4KICAgIDxyZWN0IHg9IjMiIHk9IjYiIHdpZHRoPSI2IiBoZWlnaHQ9IjMiIGZpbGw9IiM2NjYiIC8+Cjwvc3ZnPg==";

export function get_ai_tool_definitions() {
  env.value_return(
    JSON.stringify([
      {
        name: "store_signing_key",
        description:
          "Stores the signing key for the authenticated user. Must be called before using get_locked_content.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        requires_transaction: true,
      },
      {
        name: "get_locked_content",
        description:
          "Checks if locked content for an NFT is accessible. Requires authentication via a signed message.",
        parameters: {
          type: "object",
          properties: {
            token_id: {
              type: "string",
              description: "The token ID of the NFT.",
            },
          },
          required: ["token_id"],
        },
        requires_transaction: false, // This remains false as the actual contract call is a view call
        clientImplementation: `
          const { token_id } = args;
          const tokenIdStr = token_id.toString();

          const account_id = await env.callHostAsync({ function_name: "getAccountId" });
          print("Account ID: " + account_id);

          const message = JSON.stringify({ token_id: tokenIdStr, account_id });

          print("Message: " + message);
          const signature = await env.callHostAsync({ function_name: "signMessage", message});
          print("Signature: " + signature);

          const verificationResult = await env.callHostAsync({ function_name: "callToolOnContract", toolName: "get_locked_content", args: JSON.stringify({
            message,
            signature,
            token_id: tokenIdStr,
            verify_only: true
          })});
          print("Verification result: " + verificationResult);
          return verificationResult;
        `,
      },
    ]),
  );
}

export function get_locked_content() {
  const { message, signature, verify_only } = JSON.parse(env.input());
  const { token_id, account_id } = JSON.parse(message);
  const validSignature = env.verify_signed_message(
    message,
    signature,
    account_id,
  );
  if (!validSignature) {
    env.value_return(JSON.stringify("invalid signature"));
    return;
  }
  const token_owner_id = JSON.parse(env.nft_token(token_id)).owner_id;
  if (token_owner_id !== account_id) {
    env.value_return(JSON.stringify("not owner"));
    return;
  }
  const content = env.get_content_base64(`locked-${token_id}`);
  if (!verify_only) {
    env.value_return(JSON.stringify(content));
  } else {
    env.value_return(
      JSON.stringify(
        `Use this signed message for accessing the content: ${env.base64_encode(message)}.${signature}`,
      ),
    );
  }
}

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
  } else if (
    request.path == "/icon.svg" ||
    request.path == "/assets/icon.svg"
  ) {
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

export function store_signing_key() {
  if (env.nft_supply_for_owner(env.signer_account_id()) > 0) {
    env.store_signing_key(env.block_timestamp_ms() + 24 * 60 * 60 * 1000);
  } else {
    env.panic("only NFT owners account can store signing key");
  }
}

export function nft_metadata() {
  return {
    name: "WebAssembly Music by Peter Salomonsen",
    symbol: "PSMUSIC",
    icon: `data:image/svg+xml;base64,${icon_svg_base64}`,
    base_uri: null,
    reference: null,
    reference_hash: null,
  };
}

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

/**
 * @returns
 */
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
  // Check if this token has encrypted content
  const has_encrypted_content =
    env.storage_read(`encrypted-scalar:${args.token_id}`) !== null;

  if (has_encrypted_content) {
    // Hold funds in escrow (pay to contract)
    // Seller will get paid after finalize_reencryption
    addPayout(env.current_account_id(), balance);

    // Store escrow info
    const escrow_data = {
      token_id: args.token_id,
      previous_owner: token_owner_id,
      balance: args.balance,
      payout: {
        [token_owner_id]: ((balance * 80n) / 100n).toString(),
        [contract_owner]: ((balance * 20n) / 100n).toString(),
      },
    };
    env.storage_write(`escrow:${args.token_id}`, JSON.stringify(escrow_data));
  } else {
    // Regular payout (no encrypted content)
    addPayout(token_owner_id, (balance * BigInt(80_00)) / BigInt(100_00));
    addPayout(contract_owner, (balance * BigInt(20_00)) / BigInt(100_00));
  }

  Object.keys(payout).forEach((k) => (payout[k] = payout[k].toString()));
  return JSON.stringify({ payout });
}

// ============================================================================
// Encrypted Content Functions
// ============================================================================

/**
 * Register encryption public key for the caller
 * Must be called before receiving encrypted NFTs
 */
export function register_encryption_pubkey() {
  const { pubkey_base64 } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Validate pubkey is 32 bytes (compressed Ristretto point)
  // 32 bytes in base64 = 44 characters (with padding)
  // Allow for URL-safe base64 which might not have padding (43 chars minimum)
  if (pubkey_base64.length < 43 || pubkey_base64.length > 44) {
    env.panic("Invalid pubkey: must be 32 bytes (44 chars base64)");
  }

  // Store: account → ristretto public key mapping
  env.storage_write(`encryption_key:${caller}`, pubkey_base64);
}

/**
 * Get registered encryption public key for an account
 */
export function get_encryption_pubkey() {
  const { account_id } = JSON.parse(env.input());
  const pubkey = env.storage_read(`encryption_key:${account_id}`);

  if (!pubkey) {
    env.value_return(JSON.stringify(null));
    return;
  }

  env.value_return(JSON.stringify({ pubkey_base64: pubkey }));
}

/**
 * Mint NFT with encrypted content
 * Caller must provide encrypted content and ElGamal ciphertext
 */
export function nft_mint_with_encrypted_content() {
  const caller = env.signer_account_id();

  // Only contract account can mint
  if (caller !== env.current_account_id()) {
    env.panic("only contract account can mint");
  }

  const {
    token_id,
    token_owner_id,
    token_metadata,
    encrypted_content_base64, // Encrypted with AES-GCM key
    encrypted_scalar_base64, // 92 bytes: IV + encrypted (secret_scalar + randomness) + tag
    elgamal_ciphertext_c1_base64, // 32 bytes
    elgamal_ciphertext_c2_base64, // 32 bytes
    owner_pubkey_base64, // 32 bytes: owner's Ristretto pubkey
  } = JSON.parse(env.input());

  // Verify owner has registered encryption key
  const registered_pubkey = env.storage_read(
    `encryption_key:${token_owner_id}`,
  );
  if (!registered_pubkey) {
    env.panic(`Owner ${token_owner_id} has not registered encryption key`);
  }

  if (registered_pubkey !== owner_pubkey_base64) {
    env.panic("Provided pubkey does not match registered key");
  }

  // Store encrypted content data
  env.storage_write(`locked-content:${token_id}`, encrypted_content_base64);
  env.storage_write(`encrypted-scalar:${token_id}`, encrypted_scalar_base64);
  env.storage_write(
    `elgamal-ciphertext-c1:${token_id}`,
    elgamal_ciphertext_c1_base64,
  );
  env.storage_write(
    `elgamal-ciphertext-c2:${token_id}`,
    elgamal_ciphertext_c2_base64,
  );
  env.storage_write(`owner-pubkey:${token_id}`, owner_pubkey_base64);

  // Return the token metadata for minting
  return JSON.stringify(token_metadata);
}

/**
 * Finalize re-encryption and release escrow payment
 * Called by previous owner after transfer
 */
export function finalize_reencryption() {
  const {
    token_id,
    new_ciphertext_c1_base64,
    new_ciphertext_c2_base64,
    proof,
  } = JSON.parse(env.input());

  const caller = env.signer_account_id();

  // Load escrow data
  const escrow_json = env.storage_read(`escrow:${token_id}`);
  if (!escrow_json) {
    env.panic(`No pending escrow for token ${token_id}`);
  }

  const escrow = JSON.parse(escrow_json);

  // Verify caller is the previous owner
  if (caller !== escrow.previous_owner) {
    env.panic("Only previous owner can finalize re-encryption");
  }

  // Load stored encryption state
  const old_ciphertext_c1 = env.storage_read(
    `elgamal-ciphertext-c1:${token_id}`,
  );
  const old_ciphertext_c2 = env.storage_read(
    `elgamal-ciphertext-c2:${token_id}`,
  );
  const old_pubkey = env.storage_read(`owner-pubkey:${token_id}`);

  // Get new owner's registered pubkey
  const token = JSON.parse(env.nft_token(token_id));
  const new_owner = token.owner_id;
  const new_pubkey = env.storage_read(`encryption_key:${new_owner}`);

  if (!new_pubkey) {
    env.panic(`New owner ${new_owner} has not registered encryption key`);
  }

  // Verify zero-knowledge proof
  const is_valid = env.verify_reencryption_proof(
    old_ciphertext_c1,
    old_ciphertext_c2,
    old_pubkey,
    new_ciphertext_c1_base64,
    new_ciphertext_c2_base64,
    new_pubkey,
    proof.commit_r_old_base64,
    proof.commit_s_old_base64,
    proof.commit_r_new_base64,
    proof.commit_s_new_base64,
    proof.response_s_base64,
    proof.response_r_old_base64,
    proof.response_r_new_base64,
  );

  if (!is_valid) {
    env.panic("Invalid re-encryption proof");
  }

  // Update stored ciphertext for new owner
  env.storage_write(
    `elgamal-ciphertext-c1:${token_id}`,
    new_ciphertext_c1_base64,
  );
  env.storage_write(
    `elgamal-ciphertext-c2:${token_id}`,
    new_ciphertext_c2_base64,
  );
  env.storage_write(`owner-pubkey:${token_id}`, new_pubkey);

  // Release escrow payment
  Object.entries(escrow.payout).forEach(([account, amount]) => {
    env.promise_batch_action_transfer(account, amount);
  });

  // Clear escrow
  env.storage_remove(`escrow:${token_id}`);

  return JSON.stringify({ success: true });
}

/**
 * Cancel transfer and refund if seller never provides re-encryption
 * Can only be called by new owner
 */
export function cancel_transfer_and_refund() {
  const { token_id } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Load escrow data
  const escrow_json = env.storage_read(`escrow:${token_id}`);
  if (!escrow_json) {
    env.panic(`No pending escrow for token ${token_id}`);
  }

  const escrow = JSON.parse(escrow_json);

  // Verify caller is the current (new) owner
  const token = JSON.parse(env.nft_token(token_id));
  if (caller !== token.owner_id) {
    env.panic("Only current owner can cancel transfer");
  }

  // Revert ownership back to previous owner
  // Note: This would require access to nft_transfer_internal which we don't have from JS
  // For now, we'll panic with a message
  env.panic(
    "Cancel transfer not yet implemented - requires internal NFT transfer access",
  );

  // TODO: When implemented:
  // env.nft_transfer_internal(token_id, escrow.previous_owner);
  // env.promise_batch_action_transfer(caller, escrow.balance);
  // env.storage_remove(`escrow:${token_id}`);
}

/**
 * Get encrypted content for an NFT
 * Only returns data, decryption happens client-side
 */
export function get_encrypted_content_data() {
  const { token_id } = JSON.parse(env.input());

  const encrypted_content = env.storage_read(`locked-content:${token_id}`);
  const encrypted_scalar = env.storage_read(`encrypted-scalar:${token_id}`);
  const ciphertext_c1 = env.storage_read(`elgamal-ciphertext-c1:${token_id}`);
  const ciphertext_c2 = env.storage_read(`elgamal-ciphertext-c2:${token_id}`);
  const owner_pubkey = env.storage_read(`owner-pubkey:${token_id}`);

  if (!encrypted_content) {
    env.value_return(
      JSON.stringify({ error: "No encrypted content for this token" }),
    );
    return;
  }

  env.value_return(
    JSON.stringify({
      encrypted_content_base64: encrypted_content,
      encrypted_scalar_base64: encrypted_scalar,
      elgamal_ciphertext: {
        c1_base64: ciphertext_c1,
        c2_base64: ciphertext_c2,
      },
      owner_pubkey_base64: owner_pubkey,
    }),
  );
}
