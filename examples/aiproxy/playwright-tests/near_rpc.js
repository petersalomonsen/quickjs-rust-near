import { Worker } from 'near-workspaces';
import { readFile } from 'fs/promises';
import { createServer } from "http";
import { createHash } from 'crypto';

const worker = await Worker.init({ port: 14500, rpcAddr: "http://localhost:14500" });
const aiTokenAccount = await worker.rootAccount.createAccount('aitoken.test.near');
await aiTokenAccount.deploy(await readFile('../fungibletoken/out/fungible_token.wasm'));
await aiTokenAccount.call(aiTokenAccount.accountId, 'new_default_meta', { owner_id: aiTokenAccount.accountId, total_supply: 1_000_000_000_000n.toString() });

const javascript = (await readFile(new URL('../../fungibletoken/e2e/aiconversation.js', import.meta.url))).toString()
    .replace("REPLACE_REFUND_SIGNATURE_PUBLIC_KEY", JSON.stringify(Array.from((await aiTokenAccount.getKey()).getPublicKey().data)));

await aiTokenAccount.call(
    aiTokenAccount.accountId,
    'post_javascript',    
    {javascript}
);

const alice = await worker.rootAccount.createAccount('alice.test.near');
await alice.call(aiTokenAccount.accountId, 'storage_deposit', {
    account_id: alice.accountId,
    registration_only: true,
}, {
    attachedDeposit: 1_0000_0000000000_0000000000n.toString()
});

await aiTokenAccount.call(aiTokenAccount.accountId, 'ft_transfer', {
    receiver_id: alice.accountId,
    amount: 128_000_000n.toString(),
}, {
    attachedDeposit: 1n.toString()
});

const real_conversation_id = `alice.test.near_${new Date().getTime()}`;;
const conversation_id = createHash('sha256').update(Buffer.from(real_conversation_id, 'utf8')).digest('hex');

await alice.call(aiTokenAccount.accountId, 'call_js_func', {
    function_name: "start_ai_conversation",
    conversation_id
});

const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        real_conversation_id
    }));
});

server.listen(14501, () => {
    console.log(`Sandbox RPC up and running`);
});
