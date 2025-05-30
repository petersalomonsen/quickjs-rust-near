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
  addPayout(token_owner_id, (balance * BigInt(80_00)) / BigInt(100_00));
  addPayout(contract_owner, (balance * BigInt(20_00)) / BigInt(100_00));
  Object.keys(payout).forEach((k) => (payout[k] = payout[k].toString()));
  return JSON.stringify({ payout });
}
