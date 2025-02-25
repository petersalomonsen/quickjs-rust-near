use near_sdk::{env, near, serde_json::json, AccountId, Gas, NearToken, Promise, PublicKey};

const NEW_ACCOUNT_DEPOSIT: NearToken = NearToken::from_near(9);
#[near(contract_state)]
#[derive(Default)]
pub struct Contract {}

#[near]
impl Contract {
    #[payable]
    pub fn create(&mut self, new_account_id: AccountId, full_access_key: PublicKey) {
        if env::attached_deposit() != NEW_ACCOUNT_DEPOSIT {
            env::panic_str(
                format!(
                    "Must attach {} NEAR to pay for account storage",
                    NEW_ACCOUNT_DEPOSIT
                )
                .as_str(),
            );
        }
        Promise::new("near".parse().unwrap()).function_call(
            "create_account_advanced".to_string(),
            json!({
                "new_account_id": new_account_id.clone(),
                "options": {
                    "full_access_keys": [full_access_key],
                    "contract_bytes_base64": include_str!("../min_self_upgrade_contract.wasm.base64.txt")
                }
            })
            .to_string()
            .as_bytes()
            .to_vec(),
            NEW_ACCOUNT_DEPOSIT,
            Gas::from_tgas(30)
        ).then(Promise::new(new_account_id).function_call(String::from("upgrade"),
            include_bytes!("../../../examples/minimumweb4/out/minimum_web4.wasm").to_vec(),
            NearToken::from_near(0),
            Gas::from_tgas(150)));
    }
}
