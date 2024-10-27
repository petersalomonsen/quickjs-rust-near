export function start_ai_conversation() {
    const amount = 128_000_000n;
    let conversation_id = env.signer_account_id() + "_" + (new Date().getTime());
    env.set_data(conversation_id, JSON.stringify({ receiver_id: env.signer_account_id(), amount: amount.toString() }));
    env.ft_transfer_internal(env.signer_account_id(), 'aitoken.testnet', amount.toString());
    env.value_return(conversation_id);
}

export function view_ai_conversation() {
    const { conversation_id } = JSON.parse(env.input());
    env.value_return(env.get_data(conversation_id));
}

export function refund_unspent() {
    const { refund_message, signature } = JSON.parse(env.input());
    const public_key = new Uint8Array([74, 228, 41, 15, 116, 28, 61, 128, 166, 59, 142, 157, 249, 47, 117, 247, 100, 245, 49, 238, 11, 198, 191, 189, 249, 115, 108, 241, 114, 247, 26, 166]);

    const signature_is_valid = env.ed25519_verify(new Uint8Array(signature), new Uint8Array(env.sha256_utf8(refund_message)), public_key);
    if (signature_is_valid) {
        const { receiver_id, refund_amount, conversation_id } = JSON.parse(refund_message);
        const conversation_data = JSON.parse(env.get_data(conversation_id));
        if (BigInt(conversation_data.amount) > BigInt(refund_amount)) {
            env.clear_data(conversation_id);
            env.ft_transfer_internal('aitoken.testnet', receiver_id, refund_amount);
            print(`refunded ${refund_amount} to ${receiver_id}`);
        }
    }
}
