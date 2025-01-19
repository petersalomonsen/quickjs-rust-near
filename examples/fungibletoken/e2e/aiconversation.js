export function start_ai_conversation() {
    const amount = 128_000_000n;
    const { conversation_id } = JSON.parse(env.input());
    if (!conversation_id) {
        env.panic(`must provide conversation_id`);
        return;
    }
    const existing_conversation = env.get_data(conversation_id);
    if (existing_conversation) {
        env.panic(`conversation already exist`);
        return;
    }
    env.set_data(conversation_id, JSON.stringify({ receiver_id: env.signer_account_id(), amount: amount.toString() }));
    env.ft_transfer_internal(env.signer_account_id(), env.current_account_id(), amount.toString());
    env.value_return(conversation_id);
}

export function view_ai_conversation() {
    const { conversation_id } = JSON.parse(env.input());
    env.value_return(env.get_data(conversation_id));
}

export function refund_unspent() {
    const { refund_message, signature } = JSON.parse(env.input());
    const public_key = new Uint8Array(REPLACE_REFUND_SIGNATURE_PUBLIC_KEY);

    const signature_is_valid = env.ed25519_verify(new Uint8Array(signature), new Uint8Array(env.sha256_utf8(refund_message)), public_key);

    if (signature_is_valid) {
        const { receiver_id, refund_amount, conversation_id } = JSON.parse(refund_message);

        const conversation_data = JSON.parse(env.get_data(conversation_id));

        if (BigInt(conversation_data.amount) >= BigInt(refund_amount)) {
            env.clear_data(conversation_id);
            env.ft_transfer_internal(env.current_account_id(), receiver_id, refund_amount);
            print(`refunded ${refund_amount} to ${receiver_id}`);
        }
    } else {
        env.panic("Invalid signature");
    }
}
