use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{
    env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
};
use quickjs_rust_near::web4::types::{Web4Request, Web4Response};
use quickjs_rust_near::jslib::{js_get_property, js_get_string, load_js_bytecode, js_call_function};
mod web4content;
use web4content::{INDEX_HTML, MUSIC_WASM, SERVICEWORKER};
use std::ffi::CStr;

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
    pub fn web4_get(&self, #[allow(unused_variables)] request: Web4Request) -> Web4Response {
        match request.path.as_str() {
            "/serviceworker.js" => Web4Response::Body {
                content_type: "application/javascript; charset=UTF-8".to_owned(),
                body: SERVICEWORKER.to_owned(),
            },
            "/music.wasm" => Web4Response::Body {
                content_type: "application/wasm; charset=UTF-8".to_owned(),
                body: MUSIC_WASM.to_owned(),
            },
            _ => Web4Response::Body {
                content_type: "text/html; charset=UTF-8".to_owned(),
                body: INDEX_HTML.to_owned(),
            },
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
            let val = js_call_function(jsmod, "nft_metadata".as_ptr() as i32);
            let name = CStr::from_ptr(js_get_string(js_get_property(val, "name".as_ptr() as i32)) as *const i8).to_str().unwrap();
            let symbol = CStr::from_ptr(js_get_string(js_get_property(val, "symbol".as_ptr() as i32)) as *const i8).to_str().unwrap();
            let icon = CStr::from_ptr(js_get_string(js_get_property(val, "icon".as_ptr() as i32)) as *const i8).to_str().unwrap();

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
    use quickjs_rust_near::testenv::testenv::{alice, set_signer_account_id, setup_test_env, assert_latest_return_value_string_eq};

    #[test]
    fn test_nft_metadata() {
        setup_test_env();
        let contract = Contract::new();
        contract.nft_metadata();
    }
}