import 'https://cdn.jsdelivr.net/npm/near-api-js@0.44.2/dist/near-api-js.js';
import { wrapJSmusicInTemplate } from './webassemblymusic/musictemplate.js';
import { playMusic, postEventList } from './audio/audio.js';
import styleCss from './style.css.js';
import html from './app.html.js';
const { connect, keyStores, WalletConnection } = nearApi;

const hostnameparts = location.hostname.split('.');
const isOnWeb4 = location.hostname.endsWith('.page');
const contractAccountId = isOnWeb4 ? `${hostnameparts[0]}.${hostnameparts[1]}` : 'dev-1660489620893-78217528502545';
const networkId = isOnWeb4 ? (hostnameparts[1] == 'near' ? 'mainnet' : 'testnet') : 'testnet';

const connectionConfig = {
    networkId: networkId,
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    nodeUrl: `https://rpc.${networkId}.near.org`,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
    explorerUrl: `https://explorer.${networkId}.near.org`,
};

let signingKeyStored = false;
customElements.define('app-wasm-music-share', class extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this.shadowRoot.innerHTML = `<style>${styleCss}</style>\n${html}`;

        const setStatusText = (html) => {
            this.shadowRoot.querySelector('#statusspan').innerHTML = html;
        }
        
        const checkSignedin = async () => {
            const nearConnection = await connect(connectionConfig);
            const wc = await new WalletConnection(nearConnection);
            const acc = wc.account();
        
            const publicKey = await acc.connection.signer.getPublicKey(acc.accountId, acc.connection.networkId);
        
            if (!publicKey) {
                await wc.signOut();
            } else {
                const accessKey = await acc.connection.provider.query({
                    request_type: "view_access_key",
                    finality: "final",
                    account_id: acc.accountId,
                    public_key: publicKey.toString(),
                });
        
                if (accessKey.permission.FunctionCall.receiver_id != contractAccountId) {
                    wc.signOut();
                    await acc.deleteKey(publicKey.toString());
                } else {
                    const remainingAllowance = parseFloat(nearApi.utils.format.formatNearAmount(accessKey.permission.FunctionCall.allowance));
                    console.log('remaining allowance', remainingAllowance);
                    if (remainingAllowance < 0.05) {
                        wc.signOut();
                        await acc.deleteKey(publicKey.toString());
                    }
                }
            }
        
            if (!wc.isSignedIn()) {
                await wc.requestSignIn(
                    contractAccountId,
                    'JS music player'
                );
            }
            return wc;
        }
        
        const loadMusic = async () => {
            await playMusic();
            const accountid = this.shadowRoot.querySelector('#accountidinput').value;
            if (!accountid) {
                setStatusText(`<span class="errorstatus">please provide an account name</span>`);
                return;
            }
            try {
                setStatusText(`generating music on-chain from account <span class="codeblock">${accountid}</span>`);
                const wc = await checkSignedin();
                const account = wc.account();
                if (!signingKeyStored) {
                    await account.functionCall(contractAccountId, 'store_signing_key');
                    signingKeyStored = true;
                }
                const params = JSON.parse(this.shadowRoot.querySelector('#paramstextarea').value);
                
                const keyPair = await account.connection.signer.keyStore.getKey(connectionConfig.networkId, account.accountId);
                const signature = await keyPair.sign(new TextEncoder().encode(JSON.stringify(params)));
                const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

                const result = await account.viewFunction(contractAccountId,
                    'run_script_for_account_no_return', 
                        {
                            account_id: accountid,
                            signer_account_id: account.accountId,
                            signature: signatureBase64,
                            songconfig: params
                        },
                );
                setStatusText(`playing from account <span class="codeblock">${accountid}</span>`);
        
                postEventList(result);
            } catch (e) {
                setStatusText(`<span class="errorstatus">${e}</span>`);
                console.error(e);
            }
        }
        
        this.shadowRoot.querySelector('#loadmusicbutton').addEventListener('click', () => loadMusic());
        
        this.shadowRoot.querySelector('#submitmusicbutton').addEventListener('click', async () => {
            await playMusic();
            let musicscript = this.shadowRoot.querySelector('#musicscriptextarea').value;
            const compilesongcheckbox = this.shadowRoot.querySelector('#compilesongcheckbox');
            if (compilesongcheckbox.checked) {
                musicscript = wrapJSmusicInTemplate(musicscript);
            }
            
            setStatusText(`posting music script`);
            const wc = await checkSignedin();
            const result = await wc.account().functionCall(contractAccountId, 'submit_script', {script: musicscript}, '300000000000000');
            setStatusText(JSON.stringify(result));
        });        
    }
});
