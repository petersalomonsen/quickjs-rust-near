use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{
    env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue, base64,
};
use quickjs_rust_near::jslib::{js_get_property, js_get_string, load_js_bytecode, js_call_function};
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
    jsbytecode: Vec<u8>
}

#[near_bindgen]
impl Contract {
    pub fn web4_get(&self) {
        let jsmod = load_js_bytecode(self.jsbytecode.as_ptr(), self.jsbytecode.len());
        let web4_get_str = CString::new("web4_get").unwrap();
        unsafe {
            let val = js_call_function(jsmod, web4_get_str.as_ptr() as i32);
            print!("returned {}", val);
        }
    }

    pub fn post_quickjs_bytecode(&mut self, bytecodebase64: String) {        
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        self.jsbytecode = bytecode.unwrap();
    }

    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        token_owner_id: AccountId,
        token_metadata: TokenMetadata,
    ) -> Token {
        assert_eq!(env::predecessor_account_id(), self.tokens.owner_id, "Unauthorized");
        self.tokens.internal_mint(token_id, token_owner_id, Some(token_metadata))
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
            jsbytecode: vec![]
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
            let name = CStr::from_ptr(js_get_string(js_get_property(val, name_str.as_ptr() as i32)) as *const i8).to_str().unwrap();
            let symbol = CStr::from_ptr(js_get_string(js_get_property(val, symbol_str.as_ptr() as i32)) as *const i8).to_str().unwrap();
            let icon = CStr::from_ptr(js_get_string(js_get_property(val, icon_str.as_ptr() as i32)) as *const i8).to_str().unwrap();

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
    use quickjs_rust_near_testenv::testenv::{set_input, setup_test_env, assert_latest_return_value_contains};
    static QUICKJS_BINARY: &'static [u8] = include_bytes!("quickjsbytecode.bin");

    #[test]
    fn test_nft_metadata() {
        setup_test_env();
        let mut contract = Contract::new();
        contract.post_quickjs_bytecode(base64::encode(QUICKJS_BINARY));
        let metadata = contract.nft_metadata();
        assert_eq!("Example NEAR non-fungible token".to_string(), metadata.name);
        assert_eq!("EXAMPLE".to_string(), metadata.symbol);
    }

    #[test]
    fn test_web4_get() {
        setup_test_env();
        set_input("{\"request\": {\"path\": \"/serviceworker.js\"}}".try_into().unwrap());
        let mut contract = Contract::new();
        contract.post_quickjs_bytecode(base64::encode(QUICKJS_BINARY));
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"application/javascript; charset=UTF-8\",\"body\":\"Y29uc".to_owned());

        set_input("{\"request\": {\"path\": \"/music.wasm\"}}".try_into().unwrap());
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"application/wasm".to_owned());

        set_input("{\"request\": {\"path\": \"/index.html\"}}".try_into().unwrap());
        contract.web4_get();
        assert_latest_return_value_contains("{\"contentType\":\"text/html".to_owned());
    }
}