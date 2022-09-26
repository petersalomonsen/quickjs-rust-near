use ed25519_dalek::ed25519::signature::Signature as DalekSig;
use ed25519_dalek::{PublicKey as DalekPK};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env};
use std::collections::HashMap;

const ACCOUNT_SIGNING_KEYS_KEY: &[u8] = b"ACCSIGNKEYS";

#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct AccountSigningKeys {
    signing_keys_per_account: HashMap<String, Vec<u8>>,
}

fn load_account_signing_keys() -> AccountSigningKeys {
    return env::storage_read(ACCOUNT_SIGNING_KEYS_KEY)
        .map(|data| {
            AccountSigningKeys::try_from_slice(&data)
                .expect("Cannot deserialize the account signing keys.")
        })
        .unwrap_or_default();
}

fn save_account_signing_keys(account_signing_keys: AccountSigningKeys) {
    env::storage_write(
        ACCOUNT_SIGNING_KEYS_KEY,
        &account_signing_keys
            .try_to_vec()
            .expect("Cannot serialize account signing keys."),
    );
}

pub fn store_signing_key_for_account() {
    let mut account_signing_keys = load_account_signing_keys();
    account_signing_keys.signing_keys_per_account.insert(
        env::signer_account_id().to_string(),
        env::signer_account_pk().into_bytes(),
    );
    save_account_signing_keys(account_signing_keys);
}

pub fn verify_message_signed_by_account(
    signed_message: String,
    signature: String,
    account_id: String,
) -> bool {
    let account_signing_keys = load_account_signing_keys();
    let pk_bytes = account_signing_keys
        .signing_keys_per_account
        .get(&account_id)
        .unwrap();

    let pk = DalekPK::from_bytes(&pk_bytes[1..].to_vec()).unwrap();
    let sig = DalekSig::from_bytes(base64::decode(&signature).unwrap().as_slice()).unwrap();

    return pk.verify_strict(signed_message.as_bytes(), &sig).is_ok();
}

#[cfg(test)]
mod tests {
    use super::{store_signing_key_for_account, verify_message_signed_by_account};
    use crate::tests::testenv::{alice, set_signer_account_id, setup_test_env, set_signer_account_pk};

    #[test]
    fn test_verify_signed_message() {
        setup_test_env();
        set_signer_account_id(alice());
        set_signer_account_pk(vec![
            0, 85, 107,  80, 196, 145, 120,  98,  16,
            245,  69,   9,  42, 212,   6, 131, 229,
             36, 235, 122, 199,  84,   4, 164,  55,
            218, 190, 147,  17, 144, 195,  95, 176
        ].try_into().unwrap());

        let signed_message: String = "the expected message to be signed".to_string();        
        let signature: String = "yr73SvNvNGkycuOiMCvEKfq6yEXBT31nEjeZIBvSuo6geaNXqfZ9zJS3j1Y7ta7gcRqgGYm6QcQBiY+4s1pTAA==".to_string();
        store_signing_key_for_account();
        assert_eq!(
            verify_message_signed_by_account(signed_message, signature, "alice.near".to_string()),
            true
        );
    }
}
