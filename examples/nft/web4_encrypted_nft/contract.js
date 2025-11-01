const icon_svg_base64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDkiPgogICAgPHJlY3QgeT0iMCIgd2lkdGg9IjkiIGhlaWdodD0iMyIgZmlsbD0iIzBiZiIvPgogICAgPHJlY3QgeT0iMyIgd2lkdGg9IjYiIGhlaWdodD0iMyIgZmlsbD0iI2Y4MiIvPgogICAgPHJlY3QgeD0iNiIgeT0iMyIgd2lkdGg9IjMiIGhlaWdodD0iMyIgZmlsbD0iIzMzMyIgLz4KICAgIDxyZWN0IHk9IjYiIHdpZHRoPSIzIiBoZWlnaHQ9IjMiIGZpbGw9IiMyYWEiLz4KICAgIDxyZWN0IHg9IjMiIHk9IjYiIHdpZHRoPSI2IiBoZWlnaHQ9IjMiIGZpbGw9IiM2NjYiIC8+Cjwvc3ZnPg==";

// This will be replaced by the build script with the base64 encoded minified HTML
const VIEWER_HTML_BASE64 = "__VIEWER_HTML_BASE64__";

/**
 * Web4 handler - serves the encrypted NFT viewer
 */
export function web4_get() {
  const { request } = JSON.parse(env.input());
  const path = request.path || "/";

  if (path === "/" || path === "/index.html") {
    // Serve the encrypted NFT viewer HTML (base64 encoded)
    env.value_return(
      JSON.stringify({
        contentType: "text/html; charset=UTF-8",
        body: VIEWER_HTML_BASE64,
      })
    );
  } else {
    // 404 for other paths
    env.value_return(
      JSON.stringify({
        status: 404,
        contentType: "text/plain",
        body: "Not Found",
      })
    );
  }
}

/**
 * NFT metadata following NEP-177 standard
 */
export function nft_metadata() {
  const metadata = {
    spec: "nft-1.0.0",
    name: "Encrypted NFT Collection",
    symbol: "ENCNFT",
    icon: `data:image/svg+xml;base64,${icon_svg_base64}`,
    base_uri: null,
    reference: null,
    reference_hash: null,
  };

  env.value_return(JSON.stringify(metadata));
}

/**
 * Basic NFT mint function
 * Just returns metadata - Rust code handles storage
 */
export function nft_mint() {
  if (env.signer_account_id() != env.current_account_id()) {
    env.panic("only contract account can mint");
  }
  const args = JSON.parse(env.input());

  return JSON.stringify({
    title: `Encrypted NFT #${args.token_id}`,
    description: "NFT with encrypted content",
    media: `data:image/svg+xml;base64,${icon_svg_base64}`,
  });
}

/**
 * Get NFT token information
 */
export function nft_token() {
  const { token_id } = JSON.parse(env.input());
  const owner_id = env.storage_read(`nft:${token_id}`);

  if (!owner_id) {
    env.value_return("null");
    return;
  }

  const token = {
    token_id,
    owner_id,
    metadata: {
      title: `Encrypted NFT #${token_id}`,
      description: "NFT with encrypted content",
      media: `data:image/svg+xml;base64,${icon_svg_base64}`,
      media_hash: null,
      copies: null,
      issued_at: null,
      expires_at: null,
      starts_at: null,
      updated_at: null,
      extra: null,
      reference: null,
      reference_hash: null,
    },
    approved_account_ids: {},
  };

  env.value_return(JSON.stringify(token));
}

/**
 * Register encryption public key for an account
 * The caller registers their own public key
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
    env.value_return("null");
    return;
  }

  env.value_return(JSON.stringify({ pubkey_base64: pubkey }));
}

/**
 * Mint NFT with encrypted content
 * Stores the encrypted content and ElGamal ciphertext on-chain
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
 * Get encrypted content data for an NFT
 * Anyone can call this (data is encrypted, so it's safe)
 */
export function get_encrypted_content_data() {
  const { token_id } = JSON.parse(env.input());

  const encrypted_content = env.storage_read(`locked-content:${token_id}`);
  const encrypted_scalar = env.storage_read(`encrypted-scalar:${token_id}`);
  const c1 = env.storage_read(`elgamal-ciphertext-c1:${token_id}`);
  const c2 = env.storage_read(`elgamal-ciphertext-c2:${token_id}`);
  const owner_pubkey = env.storage_read(`owner-pubkey:${token_id}`);

  if (!encrypted_content) {
    env.value_return("null");
    return;
  }

  const data = {
    encrypted_content_base64: encrypted_content,
    encrypted_scalar_base64: encrypted_scalar,
    elgamal_ciphertext: {
      c1_base64: c1,
      c2_base64: c2,
    },
    owner_pubkey_base64: owner_pubkey,
  };

  env.value_return(JSON.stringify(data));
}

/**
 * Get NFT supply for owner
 */
export function nft_supply_for_owner() {
  const { account_id } = JSON.parse(env.input());
  const count = env.storage_read(`owner_count:${account_id}`) || "0";
  env.value_return(JSON.stringify({ count }));
}
