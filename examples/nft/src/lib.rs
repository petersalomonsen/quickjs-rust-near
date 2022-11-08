use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{
    base64, env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
};
use quickjs_rust_near::jslib::{
    compile_js, js_call_function, js_get_property, js_get_string, load_js_bytecode,
};
use std::ffi::CStr;
use std::ffi::CString;

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    NonFungibleToken,
    TokenMetadata,
    Enumeration,
    Approval,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    jsbytecode: Vec<u8>,
}

#[near_bindgen]
impl Contract {
    pub fn call_js_func(&self, function_name: String) {
        let jsmod = load_js_bytecode(self.jsbytecode.as_ptr(), self.jsbytecode.len());

        unsafe {
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    pub fn web4_get(&self) {
        let jsmod = load_js_bytecode(self.jsbytecode.as_ptr(), self.jsbytecode.len());
        let web4_get_str = CString::new("web4_get").unwrap();
        unsafe {
            js_call_function(jsmod, web4_get_str.as_ptr() as i32);
        }
    }

    pub fn post_quickjs_bytecode(&mut self, bytecodebase64: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.tokens.owner_id,
            "Unauthorized"
        );
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        self.jsbytecode = bytecode.unwrap();
    }

    pub fn post_javascript(&mut self, javascript: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.tokens.owner_id,
            "Unauthorized"
        );
        self.jsbytecode = compile_js(javascript, Some("main.js".to_string()));
    }

    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        token_owner_id: AccountId,
        token_metadata: TokenMetadata,
    ) -> Token {
        assert_eq!(
            env::predecessor_account_id(),
            self.tokens.owner_id,
            "Unauthorized"
        );
        self.tokens
            .internal_mint(token_id, token_owner_id, Some(token_metadata))
    }

    #[init(ignore_state)]
    pub fn new() -> Self {
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                env::current_account_id(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            jsbytecode: vec![],
        }
    }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        let jsmod = load_js_bytecode(self.jsbytecode.as_ptr(), self.jsbytecode.len());

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
    use super::*;

    use quickjs_rust_near::jslib::compile_js;
    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_contains, bob, set_attached_deposit,
        set_current_account_id, set_input, set_signer_account_id, set_signer_account_pk,
        setup_test_env,
    };
    static CONTRACT_JS: &'static [u8] = include_bytes!("contract.js");

    #[test]
    fn test_nft_metadata() {
        setup_test_env();
        set_current_account_id(bob());
        let mut contract = Contract::new();
        let bytecode = compile_js(
            String::from_utf8(CONTRACT_JS.to_vec()).unwrap(),
            Some("main.js".to_string()),
        );
        let bytecodebase64 = base64::encode(bytecode);

        contract.post_quickjs_bytecode(bytecodebase64);
        let metadata = contract.nft_metadata();
        assert_eq!("Example NEAR non-fungible token".to_string(), metadata.name);
        assert_eq!("EXAMPLE".to_string(), metadata.symbol);
    }

    #[test]
    fn test_mint() {
        setup_test_env();
        set_current_account_id(bob());
        set_attached_deposit(1600000000000000000000);

        let mut contract = Contract::new();
        contract.nft_mint(
            "1".to_string(),
            bob(),
            TokenMetadata {
                title: Some("test".to_string()),
                description: None,
                media: None,
                media_hash: None,
                copies: None,
                issued_at: None,
                expires_at: None,
                starts_at: None,
                updated_at: None,
                extra: None,
                reference: None,
                reference_hash: None,
            },
        );
        assert_eq!(contract.nft_supply_for_owner(bob()).0, 1 as u128);
    }

    #[test]
    fn test_web4_get() {
        setup_test_env();
        set_current_account_id(bob());
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
        contract.web4_get();
        assert_latest_return_value_contains(
            "{\"contentType\":\"application/javascript; charset=UTF-8\",\"body\":\"Y29uc"
                .to_owned(),
        );

        set_signer_account_id(alice());
        set_signer_account_pk(
            vec![
                0, 85, 107, 80, 196, 145, 120, 98, 16, 245, 69, 9, 42, 212, 6, 131, 229, 36, 235,
                122, 199, 84, 4, 164, 55, 218, 190, 147, 17, 144, 195, 95, 176,
            ]
            .try_into()
            .unwrap(),
        );

        contract.call_js_func("store_signing_key".to_string());

        let signed_message: String = "the expected message to be signed".to_string();
        let signature: String = "yr73SvNvNGkycuOiMCvEKfq6yEXBT31nEjeZIBvSuo6geaNXqfZ9zJS3j1Y7ta7gcRqgGYm6QcQBiY+4s1pTAA==".to_string();

        set_input(
            format!(
                "
            {{
                \"request\": {{
                        \"path\": \"/music.wasm\", 
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
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"application/wasm".to_owned());

        set_input(
            "{\"request\": {\"path\": \"/index.html\"}}"
                .try_into()
                .unwrap(),
        );
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"text/html".to_owned());
    }
}
