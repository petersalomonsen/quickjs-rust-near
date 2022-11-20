const { connect, keyStores, WalletConnection, Contract } = nearApi;

const connectionConfig = {
    networkId: "testnet",
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org",
};

const contractAccountId = 'psalomo.testnet';
const nearConnection = await connect(connectionConfig);
const walletConnection = new WalletConnection(nearConnection);

if (!walletConnection.isSignedIn()) {
    const loginbutton = document.getElementById('loginbutton');
    loginbutton.style.display = 'block';
    loginbutton.addEventListener('click', () => {
        walletConnection.requestSignIn(
            {contractId: contractAccountId, methodNames: ['call_js_func']}
        );
    });
} else {
    const account = walletConnection.account();
    const contract = new Contract(account, contractAccountId, {
        changeMethods: ['call_js_func'],
        viewMethods: ['web4_get']
    });
    await contract.call_js_func({'function_name': 'store_signing_key'});

    const message = 'hello';

    const keyPair = await account.connection.signer.keyStore.getKey(
        connectionConfig.networkId,
        account.accountId
    );
    const signature = await keyPair.sign(new TextEncoder().encode(message));
    const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

    const requestQuery = `?message=${encodeURIComponent(message)}&account_id=${encodeURIComponent(account.accountId)}&signature=${encodeURIComponent(signatureBase64)}`;
    const playerUrl = `https://psalomo.testnet.page/${requestQuery}`;
    console.log(playerUrl);
    const result = await contract.web4_get({request: {path: `/music.wasm${requestQuery}`}});
    console.log(result);
}
