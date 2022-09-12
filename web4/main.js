import 'https://cdn.jsdelivr.net/npm/near-api-js@0.44.2/dist/near-api-js.js';
import { getSynthWasm } from './synth.js';
import { AudioWorkletProcessorUrl } from './audioworkletprocessor.js';
import { wrapJSmusicInTemplate } from './musictemplate.js';

const { connect, keyStores, WalletConnection } = nearApi;

let musicPlaying = false;
let audioworkletnode;

const hostnameparts = location.hostname.split('.');
const isOnWeb4 = location.hostname.endsWith('.page');
const contractAccountId = isOnWeb4 ? `${hostnameparts[0]}.${hostnameparts[1]}` : 'dev-1660489620893-78217528502545';
const networkId = isOnWeb4 ? hostnameparts[1] : 'testnet';

const connectionConfig = {
    networkId: networkId,
    keyStore: new keyStores.BrowserLocalStorageKeyStore(),
    nodeUrl: `https://rpc.${networkId}.near.org`,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
    explorerUrl: `https://explorer.${networkId}.near.org`,
};

async function playMusic() {
    if (musicPlaying) {
        return;
    }
    musicPlaying = true;
    const audioctx = new AudioContext();
    audioctx.resume();

    const wasmsynth = await getSynthWasm();

    await audioctx.audioWorklet.addModule(AudioWorkletProcessorUrl);
    audioworkletnode = new AudioWorkletNode(audioctx, 'asc-midisynth-audio-worklet-processor', {
        outputChannelCount: [2]
    });
    audioworkletnode.port.start();

    audioworkletnode.port.postMessage({
        samplerate: audioctx.sampleRate,
        wasm: wasmsynth
    });

    audioworkletnode.connect(audioctx.destination);
}

function postEventList(eventList) {
    audioworkletnode.port.postMessage({
        sequencedata: eventList
    });
}

function setStatusText(html) {
    document.querySelector('#statusspan').innerHTML = html;
}

async function checkSignedin() {
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
            if (remainingAllowance < 0.06) {
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

async function loadMusic(viewOnly) {
    await playMusic();
    const accountid = document.querySelector('#accountidinput').value;
    if (!accountid) {
        setStatusText(`<span class="errorstatus">please provide an account name</span>`);
        return;
    }
    try {
        setStatusText(`generating music on-chain from account <span class="codeblock">${accountid}</span>`);
        const wc = await checkSignedin();
        const paramsjson = document.querySelector('#paramstextarea').value;
        if (viewOnly) {
            const result = await wc.account().viewFunction(contractAccountId, 'run_script_for_account_no_return', Object.assign({account_id: accountid}, JSON.parse(paramsjson)));
            setStatusText(`playing from account <span class="codeblock">${accountid}</span>`);

            postEventList(result);
        } else {
            const result = await wc.account().functionCall(contractAccountId, 'run_script_for_account_no_return', Object.assign({account_id: accountid}, JSON.parse(paramsjson)), '60000000000000');
            setStatusText(`playing from account <span class="codeblock">${accountid}</span><p>${JSON.stringify(result)}</p>`);

            postEventList(JSON.parse(atob(result.status.SuccessValue)));
        }
    } catch (e) {
        setStatusText(`<span class="errorstatus">${e}</span>`);
    }
}

document.querySelector('#playmusicbutton').addEventListener('click', () => loadMusic(false));
document.querySelector('#playmusicbuttonanonymous').addEventListener('click', () => loadMusic(true));

document.querySelector('#submitmusicbutton').addEventListener('click', async () => {
    await playMusic();
    const musicscript = wrapJSmusicInTemplate(document.querySelector('#musicscriptextarea').value);
    
    setStatusText(`posting music script`);
    const wc = await checkSignedin();
    const result = await wc.account().functionCall(contractAccountId, 'submit_script', {script: musicscript}, '60000000000000');
    setStatusText(JSON.stringify(result));
});