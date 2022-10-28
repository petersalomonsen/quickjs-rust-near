use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{
    env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
};
use quickjs_rust_near::jslib::{js_get_property, js_get_string, load_js_bytecode, js_call_function};
use std::ffi::CStr;
use std::ffi::CString;

static QUICKJS_BINARY: &'static [u8] = include_bytes!("quickjsbytecode.bin");

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken
}

#[near_bindgen]
impl Contract {
    pub fn web4_get(&self) {
        let jsmod = load_js_bytecode(QUICKJS_BINARY.to_vec());
        unsafe {
            let val = js_call_function(jsmod, CString::new("web4_get").unwrap().as_ptr() as i32);
            print!("returned {}", val);
        }
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
                AccountId::new_unchecked("psalomo.testnet".to_string()),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
        }
    }
}

near_contract_standards::impl_non_fungible_token_core!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_approval!(Contract, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(Contract, tokens);

#[near_bindgen]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        let jsmod = load_js_bytecode(QUICKJS_BINARY.to_vec());
        
        unsafe {
            let val = js_call_function(jsmod, CString::new("nft_metadata").unwrap().as_ptr() as i32);
            let name = CStr::from_ptr(js_get_string(js_get_property(val, CString::new("name").unwrap().as_ptr() as i32)) as *const i8).to_str().unwrap();
            let symbol = CStr::from_ptr(js_get_string(js_get_property(val, CString::new("symbol").unwrap().as_ptr() as i32)) as *const i8).to_str().unwrap();
            let icon = CStr::from_ptr(js_get_string(js_get_property(val, CString::new("icon").unwrap().as_ptr() as i32)) as *const i8).to_str().unwrap();

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

    #[test]
    fn test_nft_metadata() {
        setup_test_env();
        let contract = Contract::new();
        let metadata = contract.nft_metadata();
        assert_eq!("Example NEAR non-fungible token".to_string(), metadata.name);
        assert_eq!("EXAMPLE".to_string(), metadata.symbol);
    }

    #[test]
    fn test_web4_get() {
        setup_test_env();
        set_input("{\"request\": {\"path\": \"/serviceworker.js\"}}".try_into().unwrap());
        let contract = Contract::new();
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