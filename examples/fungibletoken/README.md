# A customizable Fungible Token contract

This example contains the standard Fungible Token contract which you can read more about in https://docs.near.org/build/primitives/ft.

The added JavaScript engine makes it for example possible to add custom transfer functions.

Below is an example from the tests, that transfers a fixed amount of `2000` tokens to `alice`. When calling this function, a `transfer_id` is returned, which `alice` then can use to return excessive funds. In this example `alice` can call the `refund` function with the `transfer_id` as argument, and then the account that did the transfer to `alice` will get `1000` tokens in refund.

One of the intended use cases of this is to be able to reserve the max needed tokens for an AI request, and then return back to the caller the unspent tokens.

```javascript
export function transfer_2_000_to_alice() {
    const amount = 2_000n;
    const transfer_id = env.signer_account_id() + '_' + new Date().getTime();
    env.set_data(transfer_id, JSON.stringify({receiver_id: env.signer_account_id(), refund_amount: (amount / 2n).toString()}));
    env.ft_transfer('alice.test.near', amount.toString());
    env.value_return(transfer_id);
}

export function refund() {
    const { transfer_id } = JSON.parse(env.input());
    const {refund_amount, receiver_id} = JSON.parse(env.get_data(transfer_id));
    env.clear_data(transfer_id);
    env.ft_transfer(receiver_id, refund_amount);
}
```
