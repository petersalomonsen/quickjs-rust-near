/*!
Fungible Token implementation with JSON serialization.
NOTES:
  - The maximum balance value is limited by U128 (2**128 - 1).
  - JSON calls should pass U128 as a base-10 string. E.g. "100".
  - The contract optimizes the inner trie structure by hashing account IDs. It will prevent some
    abuse of deep tries. Shouldn't be an issue, once NEAR clients implement full hashing of keys.
  - The contract tracks the change in storage before and after the call. If the storage increases,
    the contract requires the caller of the contract to attach enough deposit to the function call
    to cover the storage cost.
    This is done to prevent a denial of service attack on the contract by taking all available storage.
    If the storage decreases, the contract will issue a refund for the cost of the released storage.
    The unused tokens from the attached deposit are also refunded, so it's safe to
    attach more deposit than required.
  - To prevent the deployed contract from being modified or deleted, it should not have any access
    keys on its account.
*/
use std::ffi::CString;

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::{env, log, near_bindgen, AccountId, NearToken, PanicOnDefault, PromiseOrValue};
use quickjs_rust_near::jslib::{
    add_function_to_js, arg_to_str, compile_js, js_call_function, load_js_bytecode, to_js_string,
};

const JS_BYTECODE_STORAGE_KEY: &[u8] = b"JS";

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    data_map: near_sdk::collections::LookupMap<String, String>,
}

const DATA_IMAGE_SVG_NEAR_ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 288 288'%3E%3Cg id='l' data-name='l'%3E%3Cpath d='M187.58,79.81l-30.1,44.69a3.2,3.2,0,0,0,4.75,4.2L191.86,103a1.2,1.2,0,0,1,2,.91v80.46a1.2,1.2,0,0,1-2.12.77L102.18,77.93A15.35,15.35,0,0,0,90.47,72.5H87.34A15.34,15.34,0,0,0,72,87.84V201.16A15.34,15.34,0,0,0,87.34,216.5h0a15.35,15.35,0,0,0,13.08-7.31l30.1-44.69a3.2,3.2,0,0,0-4.75-4.2L96.14,186a1.2,1.2,0,0,1-2-.91V104.61a1.2,1.2,0,0,1,2.12-.77l89.55,107.23a15.35,15.35,0,0,0,11.71,5.43h3.13A15.34,15.34,0,0,0,216,201.16V87.84A15.34,15.34,0,0,0,200.66,72.5h0A15.35,15.35,0,0,0,187.58,79.81Z'/%3E%3C/g%3E%3C/svg%3E";
static mut CONTRACT_REF_MUT: *mut Contract = 0 as *mut Contract;
static mut CONTRACT_REF: *const Contract = 0 as *const Contract;

#[near_bindgen]
impl Contract {
    /// Initializes the contract with the given total supply owned by the given `owner_id` with
    /// default metadata (for example purposes only).
    #[init]
    pub fn new_default_meta(owner_id: AccountId, total_supply: U128) -> Self {
        Self::new(
            owner_id,
            total_supply,
            FungibleTokenMetadata {
                spec: FT_METADATA_SPEC.to_string(),
                name: "Example NEAR fungible token".to_string(),
                symbol: "EXAMPLE".to_string(),
                icon: Some(DATA_IMAGE_SVG_NEAR_ICON.to_string()),
                reference: None,
                reference_hash: None,
                decimals: 24,
            },
        )
    }

    /// Initializes the contract with the given total supply owned by the given `owner_id` with
    /// the given fungible token metadata.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128, metadata: FungibleTokenMetadata) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        let mut this = Self {
            token: FungibleToken::new(b"a".to_vec()),
            metadata: LazyOption::new(b"m".to_vec(), Some(&metadata)),
            data_map: near_sdk::collections::LookupMap::new(b"d".to_vec()),
        };
        this.token.internal_register_account(&owner_id);
        this.token.internal_deposit(&owner_id, total_supply.into());
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &owner_id,
            amount: total_supply,
            memo: Some("Initial tokens supply is minted"),
        }
        .emit();
        this
    }

    fn store_js_bytecode(&self, bytecode: Vec<u8>) {
        env::storage_write(JS_BYTECODE_STORAGE_KEY, &bytecode);
    }

    fn load_js_bytecode(&self) -> i64 {
        let bytecode = env::storage_read(JS_BYTECODE_STORAGE_KEY).unwrap();
        return load_js_bytecode(bytecode.as_ptr(), bytecode.len());
    }

    unsafe fn add_mut_js_functions(&mut self) {
        CONTRACT_REF_MUT = self as *mut Contract;
        add_function_to_js(
            "clear_data",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let value = arg_to_str(ctx, 1, argv);
                (*CONTRACT_REF_MUT).data_map.insert(&key, &value);
                0
            },
            2,
        );

        add_function_to_js(
            "set_data",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let value = arg_to_str(ctx, 1, argv);
                (*CONTRACT_REF_MUT).data_map.insert(&key, &value);
                0
            },
            2,
        );

        add_function_to_js(
            "ft_transfer",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let receiver_id = arg_to_str(ctx, 0, argv).parse().unwrap();
                let amount: U128 = U128(arg_to_str(ctx, 1, argv).parse::<u128>().unwrap());
                (*CONTRACT_REF_MUT).ft_transfer(receiver_id, amount, None);
                return 0;
            },
            2,
        );

        add_function_to_js(
            "ft_transfer_internal",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let sender_id = arg_to_str(ctx, 0, argv).parse().unwrap();
                let receiver_id = arg_to_str(ctx, 1, argv).parse().unwrap();
                let amount: U128 = U128(arg_to_str(ctx, 2, argv).parse::<u128>().unwrap());
                (*CONTRACT_REF_MUT).token.internal_transfer(
                    &sender_id,
                    &receiver_id,
                    amount.0,
                    None,
                );
                return 0;
            },
            2,
        );
    }

    unsafe fn add_js_functions(&self) {
        CONTRACT_REF = self as *const Contract;

        add_function_to_js(
            "get_data",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let key = arg_to_str(ctx, 0, argv);
                let value = (*CONTRACT_REF)
                    .data_map
                    .get(&key)
                    .unwrap_or_else(|| "".to_string());
                to_js_string(ctx, value)
            },
            1,
        );

        add_function_to_js(
            "ft_balance_of",
            move |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let account_id = arg_to_str(ctx, 0, argv).parse().unwrap();
                let balance = (*CONTRACT_REF).ft_balance_of(account_id).0;
                return to_js_string(ctx, balance.to_string());
            },
            1,
        );
    }

    #[payable]
    pub fn call_js_func(&mut self, function_name: String) {
        let jsmod = self.load_js_bytecode();

        unsafe {
            self.add_js_functions();
            self.add_mut_js_functions();
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    pub fn view_js_func(&self, function_name: String) {
        let jsmod = self.load_js_bytecode();

        unsafe {
            self.add_js_functions();
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    pub fn post_javascript(&mut self, javascript: String) {
        if env::signer_account_id() != env::current_account_id() {
            env::panic_str("Unauthorized");
        }
        self.store_js_bytecode(compile_js(javascript, Some("main.js".to_string())));
    }

    fn on_account_closed(&mut self, account_id: AccountId, balance: u128) {
        log!("Closed @{} with {}", account_id, balance);
    }

    fn on_tokens_burned(&mut self, account_id: AccountId, amount: u128) {
        log!("Account @{} burned {}", account_id, amount);
    }
}

near_contract_standards::impl_fungible_token_core!(Contract, token, on_tokens_burned);

#[near]
impl near_contract_standards::storage_management::StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        #[allow(unused_variables)]
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            self.on_account_closed(account_id, balance);
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near_bindgen]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::storage_management::StorageManagement;
    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_string_eq, bob, set_attached_deposit,
        set_block_timestamp, set_current_account_id, set_input, set_predecessor_account_id,
        setup_test_env,
    };

    const TOTAL_SUPPLY: u128 = 1_000_000_000_000_000;

    #[test]
    fn test_new() {
        setup_test_env();

        let contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        assert_eq!(contract.ft_total_supply().0, TOTAL_SUPPLY);
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY);
    }

    #[test]
    fn test_transfer() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_predecessor_account_id(alice());
        set_attached_deposit(contract.storage_balance_bounds().min.into());

        // Paying for account registration, aka storage deposit
        contract.storage_deposit(Some(alice()), Some(true));

        set_predecessor_account_id(bob());
        set_attached_deposit(NearToken::from_yoctonear(1));
        let transfer_amount = TOTAL_SUPPLY / 3;
        contract.ft_transfer(alice(), transfer_amount.into(), None);

        assert_eq!(
            contract.ft_balance_of(bob()).0,
            (TOTAL_SUPPLY - transfer_amount)
        );
        assert_eq!(contract.ft_balance_of(alice()).0, transfer_amount);
    }

    #[test]
    fn test_javascript() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        contract.post_javascript(
            "
        export function hello() {
            env.value_return(\"hello\");
        }
        "
            .to_string(),
        );
        contract.call_js_func("hello".to_string());
        assert_latest_return_value_string_eq("hello".to_string());
    }

    #[test]
    fn test_js_check_balance() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        contract.post_javascript(
            "
        export function check_balance() {
            const { account_id } = JSON.parse(env.input());
            env.value_return(env.ft_balance_of(account_id));
        }
        "
            .to_string(),
        );
        set_input("{\"account_id\": \"bob.near\"}".into());
        contract.call_js_func("check_balance".to_string());
        assert_latest_return_value_string_eq(TOTAL_SUPPLY.to_string());
    }

    #[test]
    fn test_js_transfer() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        contract.post_javascript(
            "
        export function transfer_2_000_to_alice() {
            const amount = 2_000n;
            env.ft_transfer('alice.near', amount.toString());
        }
        "
            .to_string(),
        );

        set_predecessor_account_id(alice());
        set_attached_deposit(contract.storage_balance_bounds().min.into());

        // Paying for account registration, aka storage deposit
        contract.storage_deposit(Some(alice()), Some(true));

        set_predecessor_account_id(bob());
        set_attached_deposit(NearToken::from_yoctonear(1));

        contract.call_js_func("transfer_2_000_to_alice".to_string());
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY - 2_000);
        assert_eq!(contract.ft_balance_of(alice()).0, 2_000);
    }

    #[test]
    fn test_js_transfer_with_custom_data() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        contract.post_javascript(
            "
        export function transfer_2_000_to_alice() {
            const amount = 2_000n;
            const transfer_id = env.signer_account_id() + '_' + new Date().getTime();
            env.set_data(transfer_id, JSON.stringify({receiver_id: env.signer_account_id(), refund_amount: (amount / 2n).toString()}));
            env.ft_transfer('alice.near', amount.toString());
            env.value_return(transfer_id);
        }

        export function refund() {
            const { transfer_id } = JSON.parse(env.input());
            const {refund_amount, receiver_id} = JSON.parse(env.get_data(transfer_id));
            env.clear_data(transfer_id);
            env.ft_transfer(receiver_id, refund_amount);
        }
        "
            .to_string(),
        );

        set_predecessor_account_id(alice());
        set_attached_deposit(contract.storage_balance_bounds().min.into());

        // Paying for account registration, aka storage deposit
        contract.storage_deposit(Some(alice()), Some(true));

        set_predecessor_account_id(bob());
        set_attached_deposit(NearToken::from_yoctonear(1));

        set_block_timestamp(1234_000_000);
        contract.call_js_func("transfer_2_000_to_alice".to_string());
        assert_latest_return_value_string_eq("bob.near_1234".to_string());
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY - 2_000);
        assert_eq!(contract.ft_balance_of(alice()).0, 2_000);

        set_predecessor_account_id(alice());
        set_input("{\"transfer_id\": \"bob.near_1234\"}".into());
        contract.call_js_func("refund".to_string());
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY - 1_000);
        assert_eq!(contract.ft_balance_of(alice()).0, 1_000);

        contract.call_js_func("refund".to_string());
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY - 1_000);
        assert_eq!(contract.ft_balance_of(alice()).0, 1_000);
    }

    #[test]
    fn test_js_transfer_internal_without_attached_neartokens() {
        setup_test_env();

        let mut contract = Contract::new_default_meta(bob().into(), TOTAL_SUPPLY.into());
        set_current_account_id(bob());
        set_predecessor_account_id(bob());
        contract.post_javascript(
            "
        export function transfer_2_000_from_bob_to_alice() {
            const amount = 2_000n;
            env.ft_transfer_internal('bob.near','alice.near', amount.toString());
            env.value_return(transfer_id);
        }"
            .to_string(),
        );

        set_predecessor_account_id(alice());
        set_attached_deposit(contract.storage_balance_bounds().min.into());

        // Paying for account registration, aka storage deposit
        contract.storage_deposit(Some(alice()), Some(true));

        set_predecessor_account_id(bob());
        set_attached_deposit(NearToken::from_yoctonear(0));

        set_block_timestamp(1234_000_000);
        contract.call_js_func("transfer_2_000_from_bob_to_alice".to_string());
        assert_eq!(contract.ft_balance_of(bob()).0, TOTAL_SUPPLY - 2_000);
        assert_eq!(contract.ft_balance_of(alice()).0, 2_000);
    }
}
