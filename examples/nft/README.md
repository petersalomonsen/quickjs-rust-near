NFT contract customizable with Javascript
=========================================

An example of Rust standard NFT contract combined with QuickJS for customizing content and behavior in Javascript.

## An example NFT with its own on-chain hosted web application with a music player

Check out the deployment here: https://webassemblymusic.near.page

The actual example is a music album with 10 tracks, almost 30 minutes of music stored on-chain. No other storage is used. All the web application hosting is also provided by the smart contract from the Javascript code [here]( https://github.com/petersalomonsen/quickjs-rust-near/blob/nft/examples/nft/src/contract.js) taking advantage of https://web4.near.page

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
  addPayout(token_owner_id, balance * BigInt(80_00) / BigInt(100_00));
  addPayout(contract_owner, balance * BigInt(20_00) / BigInt(100_00));
  Object.keys(payout).forEach(k => payout[k] = payout[k].toString());
  return JSON.stringify({ payout });
}
```

( This is also the actual implementation in the [example contract](./src/contract.js) );

## Controlling who can mint, and the content

In this contract you should implement the `nft_mint` method in Javascript where you, as you can see from the example below, can control who is able to mint and what content will be minted.

```js
export function nft_mint() {
  if (env.signer_account_id() != env.current_account_id()) {
    env.panic('only contract account can mint');
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
    media_hash: env.sha256_utf8_to_base64(svgstring)
  });
}
```

## Self-contained web-hosting

This NFT contract can also host its own web pages for serving the content using [web4](https://web4.near.page). To do so the `web4_get` method needs to be implemented where you simply write Javascript code to inspect `request.path` in order to determine what web content to render. You can respond with html, js, WebAssembly binaries, images or whatever you want to serve in the web app.

In the example below you see how to check for different paths in the request and respond with various type of content.

```js
export function web4_get() {
  const request = JSON.parse(env.input()).request;

  let response;
  if (request.path == '/serviceworker.js') {
    response = {
      contentType: "application/javascript; charset=UTF-8",
      body: env.get_content_base64(request.path)
    };
  } else if (request.path.indexOf('/musicwasms/') == 0) {
    response = {
      contentType: "application/wasm",
      body: env.get_content_base64(request.path)
    };
  } else if (request.path == '/webassemblymusicsources.zip') {
    if (env.nft_supply_for_owner(request.query.account_id[0]) > 0) {
      const validSignature = env.verify_signed_message(
        request.query.message[0],
        request.query.signature[0],
        request.query.account_id[0]
      );

      if (validSignature) {
        response = {
          contentType: "application/zip",
          body: env.get_content_base64(request.path)
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
  } else if (request.path == '/icon.svg') {
    response = {
      contentType: "image/svg+xml",
      body: icon_svg_base64
    };
  } else if (request.path == '/nftowners.json') {
    const tokens = JSON.parse(env.nft_tokens(0, 100));
    response = {
      contentType: "application/json; charset=UTF-8",
      body: env.base64_encode(JSON.stringify(tokens.map(t => ({ token_id: t.token_id, owner_id: t.owner_id }))))
    };
  } else if (request.path.endsWith('.html')) {
    response = {
      contentType: "text/html; charset=UTF-8",
      body: env.get_content_base64(request.path)
    };
  } else {
    response = {
      contentType: "text/html; charset=UTF-8",
      body: env.get_content_base64('/index.html')
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
        request.query.account_id[0]
      );

      if (validSignature) {
        response = {
          contentType: "application/zip",
          body: env.get_content_base64(request.path)
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
downloadSourcesButton.addEventListener('click', async () => {
        const account = walletConnection.account();
        const contract = new Contract(account, contractAccountId, {
            changeMethods: ['call_js_func']
        });
        const result = await contract.call_js_func({'function_name': 'store_signing_key'});

        const message = 'hello'+new Date().getTime();

        const keyPair = await account.connection.signer.keyStore.getKey(
            connectionConfig.networkId,
            account.accountId
        );
        const signature = await keyPair.sign(new TextEncoder().encode(message));
        const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

        const requestQuery = `?message=${encodeURIComponent(message)}&account_id=${encodeURIComponent(account.accountId)}&signature=${encodeURIComponent(signatureBase64)}`;
        const downloadUrl = `https://${contractAccountId}.page/webassemblymusicsources.zip${requestQuery}`;
        const downloadElement = document.createElement('a');
        downloadElement.href = downloadUrl;
        downloadElement.download = 'webassemblymusicsources.zip';
        document.documentElement.appendChild(downloadElement);
        downloadElement.click();
        document.documentElement.removeChild(downloadElement);        
    });
```

See the full implementation in [ownerspage.html](./web4/ownerspage.html)
