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
      }),
    );
  } else {
    // 404 for other paths
    env.value_return(
      JSON.stringify({
        status: 404,
        contentType: "text/plain",
        body: "Not Found",
      }),
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
 * NFT mint function with encrypted content
 * Stores encrypted content and returns metadata
 * Rust code handles calling internal_mint with the metadata
 * NOTE: This function uses 'return', not 'env.value_return()'
 * because it's called directly by Rust, not through call_js_func
 */
export function nft_mint() {
  const args = JSON.parse(env.input());

  // If encrypted content is provided, store it and validate storage payment
  if (args.encrypted_content_base64) {
    const {
      token_id,
      encrypted_content_base64,
      encrypted_scalar_base64, // 92 bytes: IV (12) + AES-encrypted(secret_scalar + randomness)(64) + tag (16)
      elgamal_ciphertext_c1_base64,
      elgamal_ciphertext_c2_base64,
      owner_pubkey_base64,
    } = args;

    // Validate pubkey is 32 bytes (compressed Ristretto point)
    if (owner_pubkey_base64.length < 43 || owner_pubkey_base64.length > 44) {
      env.panic("Invalid pubkey: must be 32 bytes (44 chars base64)");
    }

    // Calculate storage required
    const lockedContentSize = encrypted_content_base64.length;
    const encryptedScalarSize = encrypted_scalar_base64.length;
    const c1Size = elgamal_ciphertext_c1_base64.length;
    const c2Size = elgamal_ciphertext_c2_base64.length;
    const pubkeySize = owner_pubkey_base64.length;
    const keyOverhead = 100 * 5; // Approximate key overhead for 5 storage entries
    const totalStorageBytes =
      lockedContentSize +
      encryptedScalarSize +
      c1Size +
      c2Size +
      pubkeySize +
      keyOverhead;

    // NEAR storage cost: 1 byte = 10^19 yoctoNEAR (0.00001 NEAR per byte)
    const storageCost =
      BigInt(totalStorageBytes) * BigInt("10000000000000000000");
    const attached = env.attached_deposit();

    if (BigInt(attached) < storageCost) {
      env.panic(
        `Insufficient storage deposit. Required: ${storageCost} yoctoNEAR (${totalStorageBytes} bytes), ` +
          `Attached: ${attached} yoctoNEAR`,
      );
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
    env.storage_write(`encryption_key:${token_id}`, owner_pubkey_base64);
  }

  // Return metadata for the NFT
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
 * Get registered encryption public key for a token
 * Returns the owner's public key for the specified token
 */
export function get_encryption_pubkey() {
  const { token_id } = JSON.parse(env.input());
  const pubkey = env.storage_read(`encryption_key:${token_id}`);

  if (!pubkey) {
    env.value_return("null");
    return;
  }

  env.value_return(JSON.stringify({ pubkey_base64: pubkey }));
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
 * List NFT for sale
 * Only the current owner can list their token
 */
export function list_for_sale() {
  const { token_id, price } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Verify caller owns the NFT by calling Rust nft_token method
  const token_json = env.nft_token(token_id);
  const token = JSON.parse(token_json);

  if (!token) {
    env.panic("Token does not exist");
  }
  if (token.owner_id !== caller) {
    env.panic("Only owner can list token for sale");
  }

  // Validate price is positive
  const price_num = BigInt(price);
  if (price_num <= 0n) {
    env.panic("Price must be positive");
  }

  // Store listing
  env.storage_write(
    `listing:${token_id}`,
    JSON.stringify({ price, seller: caller }),
  );

  env.value_return(JSON.stringify({ success: true }));
}

/**
 * Get listing information for a token
 */
export function get_listing() {
  const { token_id } = JSON.parse(env.input());
  const listing = env.storage_read(`listing:${token_id}`);

  if (!listing) {
    env.value_return("null");
    return;
  }

  env.value_return(listing);
}

/**
 * Cancel listing
 * Only the seller can cancel
 */
export function cancel_listing() {
  const { token_id } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  const listing_data = env.storage_read(`listing:${token_id}`);
  if (!listing_data) {
    env.panic("Token is not listed for sale");
  }

  const listing = JSON.parse(listing_data);
  if (listing.seller !== caller) {
    env.panic("Only seller can cancel listing");
  }

  // Remove listing
  env.storage_remove(`listing:${token_id}`);

  env.value_return(JSON.stringify({ success: true }));
}

/**
 * Get escrow information for a token
 */
export function get_escrow() {
  const { token_id } = JSON.parse(env.input());
  const escrow = env.storage_read(`escrow:${token_id}`);

  if (!escrow) {
    env.value_return("null");
    return;
  }

  env.value_return(escrow);
}

/**
 * Cancel purchase
 * Only the buyer can cancel and get their funds back from escrow
 */
export function cancel_purchase() {
  const { token_id } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  const escrow_data = env.storage_read(`escrow:${token_id}`);
  if (!escrow_data) {
    env.panic("No pending purchase for this token");
  }

  const escrow = JSON.parse(escrow_data);

  // Verify caller is the buyer
  if (caller !== escrow.buyer) {
    env.panic("Only buyer can cancel the purchase");
  }

  // Return funds to buyer
  env.transfer(escrow.buyer, escrow.price);

  // Remove escrow
  env.storage_remove(`escrow:${token_id}`);

  env.value_return(
    JSON.stringify({
      success: true,
      message: "Purchase cancelled, funds returned",
    }),
  );
}

/**
 * Buy NFT
 * Buyer provides their public decryption key
 * Funds are held in escrow until seller completes re-encryption
 */
export function buy() {
  const { token_id, buyer_pubkey_base64 } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Validate buyer pubkey
  if (buyer_pubkey_base64.length < 43 || buyer_pubkey_base64.length > 44) {
    env.panic("Invalid buyer pubkey: must be 32 bytes (44 chars base64)");
  }

  // Check listing exists
  const listing_data = env.storage_read(`listing:${token_id}`);
  if (!listing_data) {
    env.panic("Token is not listed for sale");
  }

  const listing = JSON.parse(listing_data);

  // Verify attached deposit matches price
  const attached = env.attached_deposit();
  if (attached !== listing.price) {
    env.panic(`Must attach exactly ${listing.price} yoctoNEAR`);
  }

  // Create escrow record
  const escrow = {
    buyer: caller,
    seller: listing.seller,
    price: listing.price,
    buyer_pubkey: buyer_pubkey_base64,
  };
  env.storage_write(`escrow:${token_id}`, JSON.stringify(escrow));

  // Remove listing
  env.storage_remove(`listing:${token_id}`);

  env.value_return(
    JSON.stringify({
      success: true,
      message: "Funds in escrow. Seller must complete re-encryption.",
    }),
  );
}

/**
 * Complete sale by re-encrypting content for the new buyer
 * Seller provides re-encrypted ElGamal ciphertext and zero-knowledge proof
 * Funds are released from escrow to seller only if proof is valid
 * Note: encrypted_content stays the same, but encrypted_scalar must be updated with new randomness
 */
export function complete_sale() {
  const {
    token_id,
    elgamal_ciphertext_c1_base64,
    elgamal_ciphertext_c2_base64,
    buyer_pubkey_base64,
    encrypted_scalar_base64, // NEW: encrypted (secret_scalar + new_randomness) for buyer
    // Zero-knowledge proof parameters
    proof_commit_r_old,
    proof_commit_s_old,
    proof_commit_r_new,
    proof_commit_s_new,
    proof_response_s,
    proof_response_r_old,
    proof_response_r_new,
  } = JSON.parse(env.input());

  const caller = env.signer_account_id();

  // Get escrow record
  const escrow_data = env.storage_read(`escrow:${token_id}`);
  if (!escrow_data) {
    env.panic("No pending sale for this token");
  }

  const escrow = JSON.parse(escrow_data);

  // Verify caller is the seller
  if (caller !== escrow.seller) {
    env.panic("Only seller can complete the sale");
  }

  // Verify buyer pubkey matches
  if (buyer_pubkey_base64 !== escrow.buyer_pubkey) {
    env.panic("Buyer pubkey does not match escrow record");
  }

  // Get old ciphertext from storage
  const old_c1 = env.storage_read(`elgamal-ciphertext-c1:${token_id}`);
  const old_c2 = env.storage_read(`elgamal-ciphertext-c2:${token_id}`);
  const old_pk = env.storage_read(`owner-pubkey:${token_id}`);

  if (!old_c1 || !old_c2 || !old_pk) {
    env.panic("Original ciphertext not found");
  }

  // Verify re-encryption proof
  const proof_valid = env.verify_reencryption_proof(
    old_c1,
    old_c2,
    old_pk,
    elgamal_ciphertext_c1_base64,
    elgamal_ciphertext_c2_base64,
    buyer_pubkey_base64,
    proof_commit_r_old,
    proof_commit_s_old,
    proof_commit_r_new,
    proof_commit_s_new,
    proof_response_s,
    proof_response_r_old,
    proof_response_r_new,
  );

  if (!proof_valid) {
    env.panic("Invalid re-encryption proof - seller must provide valid proof");
  }

  // Update ElGamal ciphertext, encrypted_scalar (with new randomness), and owner pubkey
  // The encrypted_content stays the same (still encrypted with same secret)
  env.storage_write(
    `elgamal-ciphertext-c1:${token_id}`,
    elgamal_ciphertext_c1_base64,
  );
  env.storage_write(
    `elgamal-ciphertext-c2:${token_id}`,
    elgamal_ciphertext_c2_base64,
  );
  env.storage_write(`encrypted-scalar:${token_id}`, encrypted_scalar_base64);
  env.storage_write(`owner-pubkey:${token_id}`, buyer_pubkey_base64);
  env.storage_write(`encryption_key:${token_id}`, buyer_pubkey_base64);

  // Transfer NFT ownership from seller to buyer
  env.internal_transfer_unguarded(token_id, escrow.seller, escrow.buyer);

  // Release funds to seller
  env.transfer(escrow.seller, escrow.price);

  // Remove escrow
  env.storage_remove(`escrow:${token_id}`);

  env.value_return(JSON.stringify({ success: true }));
}
