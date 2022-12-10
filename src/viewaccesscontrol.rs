use ed25519_dalek::ed25519::signature::Signature as DalekSig;
use ed25519_dalek::PublicKey as DalekPK;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env};
use std::collections::HashMap;

const ACCOUNT_SIGNING_KEYS_KEY: &[u8] = b"ACCSIGNKEYS";
#[derive(Default, BorshDeserialize, BorshSerialize)]
struct AccountSigningKey {
    public_key: Vec<u8>,
    expires_timestamp_ms: u64,
}

#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct AccountSigningKeys {
    signing_keys_per_account: HashMap<String, AccountSigningKey>,
}

pub fn load_account_signing_keys() -> AccountSigningKeys {
    return env::storage_read(ACCOUNT_SIGNING_KEYS_KEY)
        .map(|data| {
            AccountSigningKeys::try_from_slice(&data)
                .expect("Cannot deserialize the account signing keys.")
        })
        .unwrap_or_default();
}

pub fn save_account_signing_keys(account_signing_keys: AccountSigningKeys) {
    env::storage_write(
        ACCOUNT_SIGNING_KEYS_KEY,
        &account_signing_keys
            .try_to_vec()
            .expect("Cannot serialize account signing keys."),
    );
}

pub fn store_signing_key_for_account(expires_timestamp_ms: u64) {
    let account_signing_keys = load_account_signing_keys();
    let mut new_account_signing_keys = AccountSigningKeys::default();

    for entry in account_signing_keys.signing_keys_per_account {
        let val = entry.1;
        if val.expires_timestamp_ms > env::block_timestamp_ms() {
            new_account_signing_keys
                .signing_keys_per_account
                .insert(entry.0, val);
        }
    }
    new_account_signing_keys.signing_keys_per_account.insert(
        env::signer_account_id().to_string(),
        AccountSigningKey {
            public_key: env::signer_account_pk().into_bytes(),
            expires_timestamp_ms: expires_timestamp_ms,
        },
    );
    save_account_signing_keys(new_account_signing_keys);
}

pub fn verify_message_signed_by_account(
    signed_message: String,
    signature: String,
    account_id: String,
) -> bool {
    let account_signing_keys = load_account_signing_keys();
    let account_signing_key_option = account_signing_keys
        .signing_keys_per_account
        .get(&account_id);

    if account_signing_key_option.is_some() {
        let account_signing_key = account_signing_key_option.unwrap();
        if account_signing_key.expires_timestamp_ms > env::block_timestamp_ms() {
            let pk = DalekPK::from_bytes(&account_signing_key_option.unwrap().public_key[1..].to_vec())
                .unwrap();
            let sig = DalekSig::from_bytes(base64::decode(&signature).unwrap().as_slice()).unwrap();

            return pk.verify_strict(signed_message.as_bytes(), &sig).is_ok();
        }
    }
    return false;
}

#[cfg(test)]
mod tests {
    use super::{
        load_account_signing_keys, store_signing_key_for_account, verify_message_signed_by_account,
    };
    use quickjs_rust_near_testenv::testenv::{
        alice, bob, set_block_timestamp, set_signer_account_id, set_signer_account_pk,
        setup_test_env,
    };
    use near_sdk::env::{block_timestamp_ms};

    const EXPIRY_MILLISECONDS: u64 = 24 * 60 * 60 * 1000;
    #[test]
    fn test_verify_signed_message() {
        setup_test_env();
        set_signer_account_id(alice());
        set_signer_account_pk(
            vec![
                0, 85, 107, 80, 196, 145, 120, 98, 16, 245, 69, 9, 42, 212, 6, 131, 229, 36, 235,
                122, 199, 84, 4, 164, 55, 218, 190, 147, 17, 144, 195, 95, 176,
            ]
            .try_into()
            .unwrap(),
        );

        let signed_message: String = "the expected message to be signed".to_string();
        let signature: String = "yr73SvNvNGkycuOiMCvEKfq6yEXBT31nEjeZIBvSuo6geaNXqfZ9zJS3j1Y7ta7gcRqgGYm6QcQBiY+4s1pTAA==".to_string();
        store_signing_key_for_account(block_timestamp_ms() + EXPIRY_MILLISECONDS);
        assert_eq!(
            verify_message_signed_by_account(signed_message, signature, "alice.near".to_string()),
            true
        );
    }

    #[test]
    fn test_should_clean_expired_signing_keys() {
        setup_test_env();
        set_signer_account_id(alice());
        set_signer_account_pk(
            vec![
                0, 85, 107, 80, 196, 145, 120, 98, 16, 245, 69, 9, 42, 212, 6, 131, 229, 36, 235,
                122, 199, 84, 4, 164, 55, 218, 190, 147, 17, 144, 195, 95, 176,
            ]
            .try_into()
            .unwrap(),
        );

        const SIGNED_MESSAGE: &str = "the expected message to be signed";
        const SIGNATURE: &str = "yr73SvNvNGkycuOiMCvEKfq6yEXBT31nEjeZIBvSuo6geaNXqfZ9zJS3j1Y7ta7gcRqgGYm6QcQBiY+4s1pTAA==";
        let mut timestamp_nanos: u64 = 0;
        set_block_timestamp(timestamp_nanos);
        store_signing_key_for_account(block_timestamp_ms() + EXPIRY_MILLISECONDS);
        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                "alice.near".to_string()
            ),
            true
        );
        timestamp_nanos += EXPIRY_MILLISECONDS * 1_000_000 / 2;
        set_block_timestamp(timestamp_nanos);

        set_signer_account_id(bob());
        store_signing_key_for_account(block_timestamp_ms() + EXPIRY_MILLISECONDS);

        assert_eq!(
            load_account_signing_keys().signing_keys_per_account.len(),
            2
        );
        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                alice().to_string()
            ),
            true
        );
        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                bob().to_string()
            ),
            true
        );

        timestamp_nanos += EXPIRY_MILLISECONDS * 1_000_000 / 2;
        set_block_timestamp(timestamp_nanos);

        set_signer_account_id(bob());
        store_signing_key_for_account(block_timestamp_ms() + EXPIRY_MILLISECONDS);

        assert_eq!(
            load_account_signing_keys().signing_keys_per_account.len(),
            1
        );
        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                "alice.near".to_string()
            ),
            false
        );

        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                "bob.near".to_string()
            ),
            true
        );

        timestamp_nanos += EXPIRY_MILLISECONDS * 1_000_000;
        set_block_timestamp(timestamp_nanos);
        assert_eq!(
            verify_message_signed_by_account(
                SIGNED_MESSAGE.to_string(),
                SIGNATURE.to_string(),
                "bob.near".to_string()
            ),
            false
        );
    }
}
