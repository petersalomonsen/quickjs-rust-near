mod payouts;
mod crypto;
use near_contract_standards::non_fungible_token::events::NftBurn;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::{near,
    assert_one_yocto, base64, env, near_bindgen, serde_json, AccountId, BorshStorageKey,
    NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
use payouts::{Payout, Payouts};
use quickjs_rust_near::jslib::{
    add_function_to_js, arg_to_number, arg_to_str, compile_js, js_call_function, js_get_property,
    js_get_string, load_js_bytecode, to_js_string,
};
use std::ffi::CStr;
use std::ffi::CString;

const JS_BYTECODE_STORAGE_KEY: &[u8] = b"JS";
const JS_CONTENT_RESOURCE_PREFIX: &str = "JSC_";
const ENCRYPTED_CONTENT_STORAGE_PREFIX: &str = "ENC_";

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate="near_sdk::borsh")]
enum StorageKey {
    NonFungibleToken,
    TokenMetadata,
    Enumeration,
    Approval,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate="near_sdk::borsh")]
pub struct Contract {
    tokens: NonFungibleToken,
}

static mut CONTRACT_REF: *const Contract = 0 as *const Contract;

#[near_bindgen]
impl Contract {
    unsafe fn add_js_functions(&self) {
        CONTRACT_REF = self as *const Contract;
        add_function_to_js(
            "get_content_base64",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let mut prefixed_key = JS_CONTENT_RESOURCE_PREFIX.to_owned();
                prefixed_key.push_str(arg_to_str(ctx, 0, argv).as_str());
                let data = env::storage_read(&prefixed_key.as_bytes()).unwrap();
                return to_js_string(ctx, base64::encode(data));
            },
            1,
        );
        add_function_to_js(
            "contract_owner",
            |ctx: i32, _this_val: i64, _argc: i32, _argv: i32| -> i64 {
                return to_js_string(ctx, (*CONTRACT_REF).tokens.owner_id.to_string());
            },
            0,
        );
        add_function_to_js(
            "nft_token",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let token_id = arg_to_str(ctx, 0, argv).to_string();
                return to_js_string(
                    ctx,
                    serde_json::to_string(&(*CONTRACT_REF).tokens.nft_token(token_id).unwrap())
                        .unwrap(),
                );
            },
            1,
        );
        add_function_to_js(
            "nft_supply_for_owner",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                return (*CONTRACT_REF)
                    .nft_supply_for_owner(arg_to_str(ctx, 0, argv).parse().unwrap())
                    .0 as i64;
            },
            1,
        );
        add_function_to_js(
            "nft_tokens",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let str = serde_json::to_string(&(*CONTRACT_REF).nft_tokens(
                    Some(U128::from(arg_to_number(ctx, 0, argv) as u128)),
                    Some(arg_to_number(ctx, 1, argv) as u64),
                ))
                .unwrap();

                return to_js_string(ctx, str);
            },
            3,
        );

        // Crypto functions for encrypted content
        add_function_to_js(
            "ristretto_basepoint_mul",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let scalar_b64 = arg_to_str(ctx, 0, argv);
                let scalar_bytes = base64::decode(&scalar_b64).unwrap_or_else(|_| vec![]);

                match crypto::ristretto_basepoint_mul(&scalar_bytes) {
                    Ok(result) => to_js_string(ctx, base64::encode(result)),
                    Err(e) => {
                        env::log_str(&format!("ristretto_basepoint_mul error: {}", e));
                        to_js_string(ctx, String::new())
                    }
                }
            },
            1,
        );

        add_function_to_js(
            "ristretto_scalar_mul",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let scalar_b64 = arg_to_str(ctx, 0, argv);
                let point_b64 = arg_to_str(ctx, 1, argv);
                let scalar_bytes = base64::decode(&scalar_b64).unwrap_or_else(|_| vec![]);
                let point_bytes = base64::decode(&point_b64).unwrap_or_else(|_| vec![]);

                match crypto::ristretto_scalar_mul(&scalar_bytes, &point_bytes) {
                    Ok(result) => to_js_string(ctx, base64::encode(result)),
                    Err(e) => {
                        env::log_str(&format!("ristretto_scalar_mul error: {}", e));
                        to_js_string(ctx, String::new())
                    }
                }
            },
            2,
        );

        add_function_to_js(
            "ristretto_point_add",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let point1_b64 = arg_to_str(ctx, 0, argv);
                let point2_b64 = arg_to_str(ctx, 1, argv);
                let point1_bytes = base64::decode(&point1_b64).unwrap_or_else(|_| vec![]);
                let point2_bytes = base64::decode(&point2_b64).unwrap_or_else(|_| vec![]);

                match crypto::ristretto_point_add(&point1_bytes, &point2_bytes) {
                    Ok(result) => to_js_string(ctx, base64::encode(result)),
                    Err(e) => {
                        env::log_str(&format!("ristretto_point_add error: {}", e));
                        to_js_string(ctx, String::new())
                    }
                }
            },
            2,
        );

        add_function_to_js(
            "ristretto_point_sub",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let point1_b64 = arg_to_str(ctx, 0, argv);
                let point2_b64 = arg_to_str(ctx, 1, argv);
                let point1_bytes = base64::decode(&point1_b64).unwrap_or_else(|_| vec![]);
                let point2_bytes = base64::decode(&point2_b64).unwrap_or_else(|_| vec![]);

                match crypto::ristretto_point_sub(&point1_bytes, &point2_bytes) {
                    Ok(result) => to_js_string(ctx, base64::encode(result)),
                    Err(e) => {
                        env::log_str(&format!("ristretto_point_sub error: {}", e));
                        to_js_string(ctx, String::new())
                    }
                }
            },
            2,
        );

        add_function_to_js(
            "verify_reencryption_proof",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let old_c1 = arg_to_str(ctx, 0, argv);
                let old_c2 = arg_to_str(ctx, 1, argv);
                let old_pk = arg_to_str(ctx, 2, argv);
                let new_c1 = arg_to_str(ctx, 3, argv);
                let new_c2 = arg_to_str(ctx, 4, argv);
                let new_pk = arg_to_str(ctx, 5, argv);
                let commit_r_old = arg_to_str(ctx, 6, argv);
                let commit_s_old = arg_to_str(ctx, 7, argv);
                let commit_r_new = arg_to_str(ctx, 8, argv);
                let commit_s_new = arg_to_str(ctx, 9, argv);
                let response_s = arg_to_str(ctx, 10, argv);
                let response_r_old = arg_to_str(ctx, 11, argv);
                let response_r_new = arg_to_str(ctx, 12, argv);

                match crypto::verify_reencryption_proof_base64(
                    &old_c1, &old_c2, &old_pk,
                    &new_c1, &new_c2, &new_pk,
                    &commit_r_old, &commit_s_old,
                    &commit_r_new, &commit_s_new,
                    &response_s, &response_r_old, &response_r_new,
                ) {
                    Ok(true) => 1i64,
                    Ok(false) => 0i64,
                    Err(e) => {
                        env::log_str(&format!("verify_reencryption_proof error: {}", e));
                        0i64
                    }
                }
            },
            13,
        );

        // NFT transfer function for marketplace
        add_function_to_js(
            "internal_transfer_unguarded",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let token_id = arg_to_str(ctx, 0, argv).to_string();
                let from = arg_to_str(ctx, 1, argv).parse().unwrap();
                let to = arg_to_str(ctx, 2, argv).parse().unwrap();

                let contract = CONTRACT_REF as *mut Contract;
                (*contract).tokens.internal_transfer_unguarded(&token_id, &from, &to);

                1i64 // Return success
            },
            3,
        );

        // Storage functions for encrypted content (with ENC_ prefix for isolation)
        add_function_to_js(
            "storage_read",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let mut prefixed_key = ENCRYPTED_CONTENT_STORAGE_PREFIX.to_owned();
                prefixed_key.push_str(&key);

                match env::storage_read(prefixed_key.as_bytes()) {
                    Some(value) => {
                        // Return the value as a string
                        match String::from_utf8(value) {
                            Ok(s) => to_js_string(ctx, s),
                            Err(_) => 0i64 // Return null for invalid UTF-8
                        }
                    }
                    None => 0i64 // Return JS null for non-existent keys
                }
            },
            1,
        );

        add_function_to_js(
            "storage_write",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let value = arg_to_str(ctx, 1, argv);
                let mut prefixed_key = ENCRYPTED_CONTENT_STORAGE_PREFIX.to_owned();
                prefixed_key.push_str(&key);

                env::storage_write(prefixed_key.as_bytes(), value.as_bytes());
                0i64 // Return undefined
            },
            2,
        );

        add_function_to_js(
            "storage_remove",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let mut prefixed_key = ENCRYPTED_CONTENT_STORAGE_PREFIX.to_owned();
                prefixed_key.push_str(&key);

                env::storage_remove(prefixed_key.as_bytes());
                0i64 // Return undefined
            },
            1,
        );

        add_function_to_js(
            "transfer",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let receiver_id: AccountId = arg_to_str(ctx, 0, argv).parse().unwrap();
                let amount_str = arg_to_str(ctx, 1, argv);
                let amount: u128 = amount_str.parse().unwrap();

                let promise_idx = env::promise_batch_create(&receiver_id);
                env::promise_batch_action_transfer(promise_idx, NearToken::from_yoctonear(amount));

                0i64 // Return undefined
            },
            2,
        );
    }

    fn load_js_bytecode(&self) -> i64 {
        let bytecode = env::storage_read(JS_BYTECODE_STORAGE_KEY).unwrap();
        return load_js_bytecode(bytecode.as_ptr(), bytecode.len());
    }

    fn store_js_bytecode(&self, bytecode: Vec<u8>) {
        env::storage_write(JS_BYTECODE_STORAGE_KEY, &bytecode);
    }

    /// Call a JavaScript function (view-only, cannot modify storage)
    pub fn call_js_func(&self, function_name: String) {
        let jsmod = self.load_js_bytecode();

        unsafe {
            self.add_js_functions();
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    /// Call a JavaScript function that can modify storage
    #[payable]
    pub fn call_js_func_mut(&mut self, function_name: String) {
        let jsmod = self.load_js_bytecode();

        unsafe {
            self.add_js_functions();
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    pub fn web4_get(&self) {
        let jsmod = self.load_js_bytecode();
        let web4_get_str = CString::new("web4_get").unwrap();
        unsafe {
            self.add_js_functions();
            js_call_function(jsmod, web4_get_str.as_ptr() as i32);
        }
    }

    pub fn post_quickjs_bytecode(&mut self, bytecodebase64: String) {
        if env::predecessor_account_id() != self.tokens.owner_id {
            env::panic_str("Unauthorized");
        }
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        self.store_js_bytecode(bytecode.unwrap());
    }

    pub fn post_javascript(&mut self, javascript: String) {
        if env::predecessor_account_id() != self.tokens.owner_id {
            env::panic_str("Unauthorized");
        }
        self.store_js_bytecode(compile_js(javascript, Some("main.js".to_string())));
    }

    pub fn post_content(&mut self, key: String, valuebase64: String) {
        if env::predecessor_account_id() != self.tokens.owner_id {
            env::panic_str("Unauthorized");
        }
        let value = base64::decode(&valuebase64).unwrap();
        let mut prefixed_key = JS_CONTENT_RESOURCE_PREFIX.to_owned();
        prefixed_key.push_str(key.as_str());
        env::storage_write(&prefixed_key.as_bytes(), &value);
    }

    #[payable]
    pub fn nft_mint(&mut self, token_id: TokenId, token_owner_id: AccountId) -> Token {
        let jsmod = self.load_js_bytecode();
        let nft_mint_str = CString::new("nft_mint").unwrap();
        unsafe {
            self.add_js_functions();

            let mint_metadata_json_string = CStr::from_ptr(js_get_string(js_call_function(
                jsmod,
                nft_mint_str.as_ptr() as i32,
            )) as *const i8)
            .to_str()
            .unwrap();

            let parsed_json = serde_json::from_str(mint_metadata_json_string);
            let token_metadata: TokenMetadata = parsed_json.unwrap();
            self.tokens
                .internal_mint(token_id, token_owner_id, Some(token_metadata))
        }
    }

    #[payable]
    pub fn nft_burn(&mut self, token_id: TokenId) {
        let token = self.nft_token(token_id.to_owned()).unwrap();
        if env::predecessor_account_id() != token.owner_id {
            env::panic_str("ERR_NOT_OWNER");
        }
        self.tokens.nft_revoke_all(token_id.to_owned());
        self.tokens.owner_by_id.remove(&token_id);
        self.tokens
            .token_metadata_by_id
            .as_mut()
            .unwrap()
            .remove(&token_id);
        let tokens_per_owner = self.tokens.tokens_per_owner.as_mut().unwrap();
        let tokens_for_owner_opt = tokens_per_owner.get(&token.owner_id);
        let mut tokens_for_owner = tokens_for_owner_opt.unwrap();
        tokens_for_owner.remove(&token_id);
        tokens_per_owner.insert(&token.owner_id, &tokens_for_owner);

        NftBurn {
            owner_id: &token.owner_id,
            token_ids: &[&token.token_id],
            authorized_id: None,
            memo: None,
        }
        .emit();
    }

    #[init]
    pub fn new() -> Self {
        if env::predecessor_account_id() != env::current_account_id() {
            env::panic_str("Unauthorized");
        }
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                env::current_account_id(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
        }
    }
}

#[near_bindgen]
impl Payouts for Contract {
    /// Given a `token_id` and NEAR-denominated balance, return the `Payout`.
    /// struct for the given token. Panic if the length of the payout exceeds
    /// `max_len_payout.
    #[allow(unused_variables)]
    fn nft_payout(&self, token_id: String, balance: U128, max_len_payout: Option<u32>) -> Payout {
        let jsmod = self.load_js_bytecode();
        let nft_payout_str = CString::new("nft_payout").unwrap();
        unsafe {
            self.add_js_functions();

            let nft_payout_json_string = CStr::from_ptr(js_get_string(js_call_function(
                jsmod,
                nft_payout_str.as_ptr() as i32,
            )) as *const i8)
            .to_str()
            .unwrap();

            let parsed_json = serde_json::from_str(nft_payout_json_string);
            return parsed_json.unwrap();
        }
    }

    /// Given a `token_id` and NEAR-denominated balance, transfer the token
    /// and return the `Payout` struct for the given token. Panic if the
    /// length of the payout exceeds `max_len_payout.`
    #[payable]
    fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        assert_one_yocto();
        let payout = self.nft_payout(token_id.to_owned(), balance, max_len_payout);
        self.nft_transfer(receiver_id, token_id, approval_id, memo);
        payout
    }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        let jsmod = self.load_js_bytecode();

        unsafe {
            let nft_metadata_str = CString::new("nft_metadata").unwrap();
            let name_str = CString::new("name").unwrap();
            let symbol_str = CString::new("symbol").unwrap();
            let icon_str = CString::new("icon").unwrap();

            let val = js_call_function(jsmod, nft_metadata_str.as_ptr() as i32);
            let name = CStr::from_ptr(
                js_get_string(js_get_property(val, name_str.as_ptr() as i32)) as *const i8,
            )
            .to_str()
            .unwrap();
            let symbol = CStr::from_ptr(js_get_string(js_get_property(
                val,
                symbol_str.as_ptr() as i32,
            )) as *const i8)
            .to_str()
            .unwrap();
            let icon = CStr::from_ptr(
                js_get_string(js_get_property(val, icon_str.as_ptr() as i32)) as *const i8,
            )
            .to_str()
            .unwrap();

            NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_string(),
                name: name.to_string(),
                symbol: symbol.to_string(),
                icon: Some(icon.to_string()),
                base_uri: None,
                reference: None,
                reference_hash: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use super::*;

    use near_sdk::NearToken;
    use quickjs_rust_near::jslib::compile_js;
    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_contains, assert_latest_return_value_string_eq, bob,
        carol, set_attached_deposit, set_block_timestamp, set_current_account_id, set_input,
        set_predecessor_account_id, set_signer_account_id, set_signer_account_pk, setup_test_env,
    };
    static CONTRACT_JS: &'static [u8] = include_bytes!("contract.js");

    #[test]
    fn test_nft_metadata() {
        setup_test_env();
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        let mut contract = Contract::new();
        let bytecode = compile_js(
            String::from_utf8(CONTRACT_JS.to_vec()).unwrap(),
            Some("main.js".to_string()),
        );
        let bytecodebase64 = base64::encode(bytecode);

        contract.post_quickjs_bytecode(bytecodebase64);
        let metadata = contract.nft_metadata();
        assert_eq!(
            "WebAssembly Music by Peter Salomonsen".to_string(),
            metadata.name
        );
        assert_eq!("PSMUSIC".to_string(), metadata.symbol);
    }

    #[test]
    fn test_mint() {
        setup_test_env();
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        set_attached_deposit(NearToken::from_yoctonear(1640000000000000000000));

        let mut contract = Contract::new();
        contract.post_javascript(
            "
        export function get_supply_for_bob() {
            env.value_return('bob supply: '+env.nft_supply_for_owner('bob.near'))
        }

        export function nft_mint() {
            print ('calling mint');
            return JSON.stringify({
                title: 'test_title',
                description: 'test_description'
            });
        }
        "
            .to_string(),
        );

        contract.call_js_func("get_supply_for_bob".to_string());
        assert_latest_return_value_string_eq("bob supply: 0".to_string());

        set_attached_deposit(NearToken::from_yoctonear(1900000000000000000000));
        contract.nft_mint("abc".to_string(), bob());
        assert_eq!(contract.nft_supply_for_owner(bob()).0, 1 as u128);

        contract.call_js_func("get_supply_for_bob".to_string());
        assert_latest_return_value_string_eq("bob supply: 1".to_string());
    }

    #[test]
    fn test_web4_get() {
        setup_test_env();
        set_current_account_id(alice());
        set_predecessor_account_id(alice());
        set_input(
            "{\"request\": {\"path\": \"/serviceworker.js\"}}"
                .try_into()
                .unwrap(),
        );
        let mut contract = Contract::new();
        let bytecode = compile_js(
            String::from_utf8(CONTRACT_JS.to_vec()).unwrap(),
            Some("main.js".to_string()),
        );
        let bytecodebase64 = base64::encode(bytecode);

        contract.post_quickjs_bytecode(bytecodebase64);
        contract.post_content(
            "/serviceworker.js".to_string(),
            base64::encode("print('serviceworker');".to_string()),
        );
        contract.web4_get();
        assert_latest_return_value_string_eq(
            r#"{"contentType":"application/javascript; charset=UTF-8","body":"cHJpbnQoJ3NlcnZpY2V3b3JrZXInKTs="}"#
                .to_owned(),
        );

        set_signer_account_id(alice());
        set_attached_deposit(NearToken::from_yoctonear(10440000000000000000000));

        contract.nft_mint("2222".to_string(), alice());

        set_signer_account_pk(
            vec![
                0, 85, 107, 80, 196, 145, 120, 98, 16, 245, 69, 9, 42, 212, 6, 131, 229, 36, 235,
                122, 199, 84, 4, 164, 55, 218, 190, 147, 17, 144, 195, 95, 176,
            ]
            .try_into()
            .unwrap(),
        );

        contract.call_js_func("store_signing_key".to_string());
        set_block_timestamp(env::block_timestamp() + 23 * 60 * 60 * 1_000_000_000);
        let signed_message: String = "the expected message to be signed".to_string();
        let signature: String = "yr73SvNvNGkycuOiMCvEKfq6yEXBT31nEjeZIBvSuo6geaNXqfZ9zJS3j1Y7ta7gcRqgGYm6QcQBiY+4s1pTAA==".to_string();

        set_input(
            format!(
                "
            {{
                \"request\": {{
                        \"path\": \"/webassemblymusicsources.zip\", 
                        \"query\": {{
                            \"account_id\": [\"alice.near\"],
                            \"message\": [\"{}\"],
                            \"signature\": [\"{}\"]
                        }}
                }}
            }}",
                signed_message, signature
            )
            .try_into()
            .unwrap(),
        );
        contract.post_content(
            "/webassemblymusicsources.zip".to_string(),
            base64::encode(vec![1, 2, 3, 4]),
        );
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"application/zip".to_owned());

        set_input(
            format!(
                "
            {{
                \"request\": {{
                        \"path\": \"/webassemblymusicsources.zip\", 
                        \"query\": {{
                            \"account_id\": [\"alice.near\"],
                            \"message\": [\"{}ee\"],
                            \"signature\": [\"{}\"]
                        }}
                }}
            }}",
                signed_message, signature
            )
            .try_into()
            .unwrap(),
        );
        contract.web4_get();

        assert_latest_return_value_contains(base64::encode("INVALID SIGNATURE").to_owned());

        assert_eq!(
            contract
                .nft_supply_for_owner("unknown.near".parse().unwrap())
                .0,
            0 as u128
        );
        set_input(
            format!(
                "
            {{
                \"request\": {{
                        \"path\": \"/webassemblymusicsources.zip\", 
                        \"query\": {{
                            \"account_id\": [\"unknown.near\"],
                            \"message\": [\"{}\"],
                            \"signature\": [\"{}\"]
                        }}
                }}
            }}",
                signed_message, signature
            )
            .try_into()
            .unwrap(),
        );
        contract.web4_get();

        assert_latest_return_value_contains(base64::encode("NOT OWNER").to_owned());

        contract.post_content("/index.html".to_string(), base64::encode("<html></html>"));
        set_input(
            "{\"request\": {\"path\": \"/index.html\"}}"
                .try_into()
                .unwrap(),
        );
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"text/html".to_owned());
    }

    #[test]
    fn test_js_list_tokens() {
        setup_test_env();
        set_current_account_id(carol());
        set_predecessor_account_id(carol());
        set_attached_deposit(NearToken::from_yoctonear(1900000000000000000000));

        let mut contract = Contract::new();
        contract.post_javascript(
            "
        export function get_tokens_json() {
            const from_index = JSON.parse(env.input()).from_index;
            const tokens = JSON.parse(env.nft_tokens(from_index,3));
            env.value_return(tokens.map(t => `${t.token_id}:${t.owner_id}`).join(','));
        }

        export function nft_mint() {
            print ('calling mint');
            return JSON.stringify({
                title: 'test_title',
                description: 'test_description'
            });
        }
        "
            .to_string(),
        );

        set_input("{\"from_index\": 0}".try_into().unwrap());
        contract.call_js_func("get_tokens_json".to_string());
        assert_latest_return_value_string_eq("".to_string());

        for n in 1..9 {
            contract.nft_mint(n.to_string(), carol());
        }

        set_input("{\"from_index\": 2}".try_into().unwrap());

        contract.call_js_func("get_tokens_json".to_string());
        assert_latest_return_value_string_eq("3:carol.near,4:carol.near,5:carol.near".to_string());
    }

    #[test]
    fn test_nft_approve() {
        setup_test_env();

        set_current_account_id(bob());
        set_predecessor_account_id(bob());

        let mut contract = Contract::new();

        contract.post_javascript(
            "

        export function nft_mint() {
            print ('calling mint');
            return JSON.stringify({
                title: 'test_title',
                description: 'test_description'
            });
        }
        "
            .to_string(),
        );

        set_attached_deposit(NearToken::from_yoctonear(1960000000000000000000));

        let token_id = "554433".to_string();
        contract.nft_mint(token_id.to_owned(), bob());

        contract.nft_approve(token_id.to_owned(), carol(), Some("test".to_string()));
        assert_eq!(true, contract.nft_is_approved(token_id, carol(), None));
    }

    #[test]
    fn test_nft_payout() {
        setup_test_env();

        set_predecessor_account_id(bob());
        set_current_account_id(bob());
        let mut contract = Contract::new();
        contract.post_javascript(
            "
            
            export function nft_mint() {
                print ('calling mint');
                return JSON.stringify({
                    title: 'test_title',
                    description: 'test_description'
                });
            }
            export function nft_payout() {
                const args = JSON.parse(env.input());
                const balance = BigInt(args.balance);
                const payout = {};
                const token_owner_id = JSON.parse(env.nft_token(args.token_id)).owner_id;
                const contract_owner = env.contract_owner();
              
                const addPayout = (account, amount) => {
                  if (!payout[account]) {
                    payout[account] = 0n;
                  }
                  payout[account] += amount;
                };
                addPayout(token_owner_id, balance * BigInt(80_00) / BigInt(100_00));
                addPayout(contract_owner, balance * BigInt(20_00) / BigInt(100_00));
                Object.keys(payout).forEach(k => payout[k] = payout[k].toString());
                return JSON.stringify({ payout });
            }              
        "
            .to_string(),
        );

        set_attached_deposit(NearToken::from_yoctonear(2000000000000000000000));

        let token_id = "5544332".to_string();
        contract.nft_mint(token_id.to_owned(), alice());

        set_input("{\"token_id\": \"5544332\", \"balance\": \"1000000000000000000000000\",\"max_len_payout\": \"3\"}".try_into().unwrap());
        let ret = contract.nft_payout("1".to_string(), U128(10000_0000000000_0000000000), Some(3));
        assert_eq!(
            U128(2000_0000000000_0000000000).0,
            ret.payout.get(&contract.tokens.owner_id).unwrap().0
        );
        assert_eq!(
            U128(8000_0000000000_0000000000).0,
            ret.payout
                .get(&contract.nft_token("5544332".to_string()).unwrap().owner_id)
                .unwrap()
                .0
        );
    }

    #[test]
    fn test_store_content() {
        setup_test_env();

        set_predecessor_account_id(bob());
        set_current_account_id(bob());

        let mut contract = Contract::new();
        contract.post_javascript(
            "
        export function get_content_base64() {
            env.value_return(env.get_content_base64('/files/testfile.js'));
        }
        "
            .to_string(),
        );
        contract.post_content(
            "/files/testfile.js".to_string(),
            base64::encode(CONTRACT_JS),
        );
        contract.call_js_func("get_content_base64".to_string());
        assert_latest_return_value_string_eq(base64::encode(CONTRACT_JS));
    }

    #[test]
    fn test_contract_owner() {
        setup_test_env();

        set_current_account_id(bob());

        let mut contract = Contract::new();
        contract.post_javascript(
            "
        export function get_contract_owner() {
            env.value_return(env.contract_owner());
        }
        "
            .to_string(),
        );

        contract.call_js_func("get_contract_owner".to_string());
        assert_latest_return_value_string_eq(contract.tokens.owner_id.to_string());
    }

    #[test]
    fn test_nft_token() {
        setup_test_env();

        set_current_account_id(bob());

        let mut contract = Contract::new();

        contract.post_javascript(
            "
        export function nft_mint() {
            return JSON.stringify({
                title: 'test_title',
                description: 'test_description'
            });
        }

        export function get_nft_token() {
            env.value_return(env.nft_token('1'));
        }
        "
            .to_string(),
        );
        set_attached_deposit(NearToken::from_yoctonear(1860000000000000000000));
        contract.nft_mint("1".to_string(), bob());
        contract.call_js_func("get_nft_token".to_string());

        let token = contract.nft_token("1".to_string()).unwrap();
        assert_latest_return_value_string_eq(serde_json::to_string(&token).unwrap());
    }

    #[test]
    fn test_nft_burn() {
        setup_test_env();

        let burn_account = AccountId::from_str("mrburn").unwrap();

        set_predecessor_account_id(burn_account.to_owned());
        set_current_account_id(burn_account.to_owned());
        let mut contract = Contract::new();
        contract.post_javascript(
            "
            
            export function nft_mint() {
                print ('calling mint');
                return JSON.stringify({
                    title: 'test_title',
                    description: 'test_description'
                });
            }
        "
            .to_string(),
        );

        set_attached_deposit(NearToken::from_yoctonear(2080000000000000000000));

        let token_id = "burn_me_now".to_string();
        contract.nft_mint(token_id.to_owned(), burn_account.to_owned());

        assert_eq!(
            contract.nft_supply_for_owner(burn_account.to_owned()),
            U128::from(1)
        );
        assert_eq!(contract.nft_total_supply(), U128::from(1));

        assert_eq!(
            contract
                .nft_token("burn_me_now".to_string())
                .unwrap()
                .token_id,
            "burn_me_now"
        );

        set_attached_deposit(NearToken::from_yoctonear(1));

        contract.nft_burn(token_id);
        assert_eq!(contract.nft_token("burn_me_now".to_string()), None);

        assert_eq!(
            contract.nft_supply_for_owner(burn_account.to_owned()),
            U128::from(0)
        );
        assert_eq!(contract.nft_total_supply(), U128::from(0));
    }
}
