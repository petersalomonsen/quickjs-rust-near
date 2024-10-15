use ed25519_dalek::Signature;
use near_sdk::{AccountId, NearToken, PublicKey};
use sha2::Digest;
use std::collections::HashMap;
use std::io::{self, Write};

const EVICTED_REGISTER: i64 = (u64::MAX - 1) as i64;

#[allow(dead_code)]
pub fn alice() -> AccountId {
    "alice.near".parse().unwrap()
}

#[allow(dead_code)]
pub fn bob() -> AccountId {
    "bob.near".parse().unwrap()
}

#[allow(dead_code)]
pub fn carol() -> AccountId {
    "carol.near".parse().unwrap()
}

struct TestEnv {
    block_timestamp: u64,
    signer_account_id: AccountId,
    signer_account_pk: PublicKey,
    current_account_id: AccountId,
    predecessor_account_id: AccountId,
    attached_deposit: NearToken,
    input: Vec<u8>,
    returned_value: Vec<u8>,
}

impl TestEnv {
    pub fn new() -> Self {
        Self {
            block_timestamp: 0,
            signer_account_id: bob(),
            current_account_id: alice(),
            predecessor_account_id: bob(),
            attached_deposit: NearToken::from_near(0),
            signer_account_pk: vec![
                00, 66, 211, 21, 84, 20, 241, 129, 29, 118, 83, 184, 41, 215, 240, 117, 106, 56,
                29, 69, 103, 43, 191, 167, 199, 102, 3, 16, 194, 250, 138, 198, 78,
            ]
            .try_into()
            .unwrap(),
            input: "{}".to_string().into_bytes(),
            returned_value: Vec::default(),
        }
    }
}

// Define static mutable variables for registers, storage, and test environment
static mut REGISTERS: Option<HashMap<i64, Vec<u8>>> = None;
static mut STORAGE: Option<HashMap<Vec<u8>, Vec<u8>>> = None;
static mut TESTENV: Option<TestEnv> = None;

pub fn setup_test_env() {
    unsafe {
        TESTENV = Some(TestEnv::new());
        REGISTERS = Some(HashMap::new());
        STORAGE = Some(HashMap::new());

        std::panic::set_hook(Box::new(|panic_info| {
            let _ = writeln!(io::stderr(), "{}", panic_info);
        }));
    }
}

#[allow(dead_code)]
pub fn set_signer_account_id(account_id: AccountId) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.signer_account_id = account_id;
        }
    }
}

#[allow(dead_code)]
pub fn set_signer_account_pk(pk: PublicKey) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.signer_account_pk = pk;
        }
    }
}

#[allow(dead_code)]
pub fn set_current_account_id(account_id: AccountId) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.current_account_id = account_id;
        }
    }
}

#[allow(dead_code)]
pub fn set_predecessor_account_id(account_id: AccountId) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.predecessor_account_id = account_id;
        }
    }
}

#[allow(dead_code)]
pub fn set_input(input: Vec<u8>) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.input = input;
        }
    }
}

pub fn set_attached_deposit(deposit: NearToken) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.attached_deposit = deposit;
        }
    }
}

pub fn set_block_timestamp(timestamp_nanos: u64) {
    unsafe {
        if let Some(test_env) = TESTENV.as_mut() {
            test_env.block_timestamp = timestamp_nanos;
        }
    }
}

#[no_mangle]
pub extern "C" fn read_register(register_id: i64, data_ptr: i64) {
    unsafe {
        let registers = REGISTERS.as_ref().unwrap();
        if let Some(val) = registers.get(&register_id) {
            std::ptr::copy(val.as_ptr(), data_ptr as *mut u8, val.len());
        }
    }
}

#[no_mangle]
pub extern "C" fn register_len(register_id: i64) -> i64 {
    unsafe {
        let registers = REGISTERS.as_ref().unwrap();
        if let Some(val) = registers.get(&register_id) {
            return val.len() as i64;
        }
        return u64::MAX as i64;
    }
}

#[no_mangle]
pub extern "C" fn signer_account_id(register: i64) {
    unsafe {
        let registers = REGISTERS.as_mut().unwrap();
        let testenv = TESTENV.as_ref().unwrap();
        registers.insert(register, testenv.signer_account_id.to_string().into_bytes());
    }
}

#[no_mangle]
pub extern "C" fn signer_account_pk(register: i64) {
    unsafe {
        let registers = REGISTERS.as_mut().unwrap();
        let testenv = TESTENV.as_ref().unwrap();
        registers.insert(register, testenv.signer_account_pk.as_bytes().to_vec());
    }
}

#[no_mangle]
pub extern "C" fn current_account_id(register: i64) {
    unsafe {
        let registers = REGISTERS.as_mut().unwrap();
        let testenv = TESTENV.as_ref().unwrap();
        registers.insert(
            register,
            testenv.current_account_id.to_string().into_bytes(),
        );
    }
}

#[no_mangle]
pub extern "C" fn predecessor_account_id(register: i64) {
    unsafe {
        let registers = REGISTERS.as_mut().unwrap();
        let testenv = TESTENV.as_ref().unwrap();
        registers.insert(
            register,
            testenv.predecessor_account_id.to_string().into_bytes(),
        );
    }
}

#[no_mangle]
pub extern "C" fn input(register: i64) {
    unsafe {
        let registers = REGISTERS.as_mut().unwrap();
        let testenv = TESTENV.as_ref().unwrap();
        registers.insert(register, testenv.input.clone());
    }
}

#[no_mangle]
pub extern "C" fn attached_deposit(data_ptr: i64) {
    unsafe {
        let testenv = TESTENV.as_ref().unwrap();
        let src = testenv.attached_deposit.as_yoctonear().to_le_bytes();
        std::ptr::copy(src.as_ptr(), data_ptr as *mut u8, src.len());
    }
}

#[no_mangle]
pub extern "C" fn value_return(value_len: i64, value_ptr: i64) {
    unsafe {
        let bufptr: *const u8 = value_ptr as *const u8;
        let buflen: usize = value_len as usize;
        let testenv = TESTENV.as_mut().unwrap();
        testenv.returned_value = std::slice::from_raw_parts(bufptr, buflen).to_vec();
    }
}

#[no_mangle]
fn panic_utf8(len: i64, ptr: i64) -> ! {
    unsafe {
        let bufptr: *const u8 = ptr as *const u8;
        let buflen: usize = len as usize;
        let str = std::str::from_utf8_unchecked(std::slice::from_raw_parts(bufptr, buflen));
        panic!("env_panic: {}", str);
    }
}

#[no_mangle]
pub extern "C" fn log_utf8(len: i64, ptr: i64) {
    unsafe {
        let bufptr: *const u8 = ptr as *const u8;
        let buflen: usize = len as usize;
        let str = std::str::from_utf8_unchecked(std::slice::from_raw_parts(bufptr, buflen));
        println!("{}", str);
    }
}

#[no_mangle]
pub extern "C" fn storage_has_key(key_len: i64, key_ptr: i64) -> i64 {
    unsafe {
        let keyptr: *const u8 = key_ptr as *const u8;
        let keylen: usize = key_len as usize;
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        return if STORAGE.as_ref().unwrap().contains_key(&key) {
            1
        } else {
            0
        };
    }
}

#[no_mangle]
pub extern "C" fn storage_write(
    key_len: i64,
    key_ptr: i64,
    value_len: i64,
    value_ptr: i64,
    _register_id: i64,
) -> i64 {
    unsafe {
        let keyptr: *const u8 = key_ptr as *const u8;
        let keylen: usize = key_len as usize;
        let valueptr: *const u8 = value_ptr as *const u8;
        let valuelen: usize = value_len as usize;
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        let val = std::slice::from_raw_parts(valueptr, valuelen).to_vec();
        let evicted = STORAGE.as_mut().unwrap().insert(key, val);
        if let Some(evicted_val) = evicted {
            REGISTERS
                .as_mut()
                .unwrap()
                .insert(EVICTED_REGISTER, evicted_val);
            return 1;
        }
        return 0;
    }
}

#[no_mangle]
pub extern "C" fn storage_read(key_len: i64, key_ptr: i64, register_id: i64) -> i64 {
    unsafe {
        let keyptr: *const u8 = key_ptr as *const u8;
        let keylen: usize = key_len as usize;
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        let storage = STORAGE.as_ref().unwrap();
        if let Some(val) = storage.get(&key) {
            REGISTERS.as_mut().unwrap().insert(register_id, val.clone());
            return 1;
        }
        return 0;
    }
}

#[no_mangle]
pub extern "C" fn storage_remove(key_len: i64, key_ptr: i64, register_id: i64) -> i64 {
    unsafe {
        let keyptr: *const u8 = key_ptr as *const u8;
        let keylen: usize = key_len as usize;
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        if let Some(val) = STORAGE.as_mut().unwrap().remove(&key) {
            REGISTERS.as_mut().unwrap().insert(register_id, val);
            return 1;
        }
        return 0;
    }
}

pub fn assert_latest_return_value_contains(value_to_be_contained: String) {
    unsafe {
        let latest_return_value =
            std::str::from_utf8(TESTENV.as_ref().unwrap().returned_value.as_ref())
                .unwrap()
                .to_string();
        assert!(
            latest_return_value.contains(&value_to_be_contained),
            "latest return value should contain {}, but was {}",
            value_to_be_contained,
            latest_return_value
        );
    }
}

pub fn assert_latest_return_value_string_eq(expected_return_value: String) {
    unsafe {
        assert_eq!(
            std::str::from_utf8(TESTENV.as_ref().unwrap().returned_value.as_ref()).unwrap(),
            expected_return_value
        );
    }
}

#[no_mangle]
pub extern "C" fn storage_usage() -> i64 {
    unsafe {
        return STORAGE
            .as_ref()
            .unwrap()
            .values()
            .map(|x| x.len() as i64)
            .sum();
    }
}

#[no_mangle]
pub extern "C" fn prepaid_gas() -> i64 {
    return 300000000000000;
}

#[no_mangle]
pub extern "C" fn sha256(value_len: i64, value_ptr: i64, register_id: i64) {
    unsafe {
        let valueptr: *const u8 = value_ptr as *const u8;
        let valuelen: usize = value_len as usize;
        let value = std::slice::from_raw_parts(valueptr, valuelen).to_vec();
        let value_hash = sha2::Sha256::digest(&value);
        REGISTERS
            .as_mut()
            .unwrap()
            .insert(register_id, value_hash.to_vec());
    }
}

#[no_mangle]
pub extern "C" fn promise_and(_promise_idx_ptr: i64, _promise_idx_count: i64) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn promise_batch_create(_account_id_len: i64, _account_id_ptr: i64) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn promise_batch_then(
    _promise_index: i64,
    _account_id_len: i64,
    _account_id_ptr: i64,
) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn promise_batch_action_create_account(_promise_index: i64) {}

#[no_mangle]
pub extern "C" fn promise_batch_action_deploy_contract(
    _promise_index: i64,
    _code_len: i64,
    _code_ptr: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_function_call(
    _promise_index: i64,
    _method_name_len: i64,
    _method_name_ptr: i64,
    _arguments_len: i64,
    _arguments_ptr: i64,
    _amount_ptr: i64,
    _gas: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_function_call_weight(
    _promise_index: i64,
    _function_name_len: i64,
    _function_name_ptr: i64,
    _arguments_len: i64,
    _arguments_ptr: i64,
    _amount_ptr: i64,
    _gas: i64,
    _weight: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_transfer(_promise_index: i64, _amount_ptr: i64) {}

#[no_mangle]
pub extern "C" fn promise_batch_action_stake(
    _promise_index: i64,
    _amount_ptr: i64,
    _public_key_len: i64,
    _public_key_ptr: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_add_key_with_full_access(
    _promise_index: i64,
    _public_key_len: i64,
    _public_key_ptr: i64,
    _nonce: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_add_key_with_function_call(
    _promise_index: i64,
    _public_key_len: i64,
    _public_key_ptr: i64,
    _nonce: i64,
    _allowance_ptr: i64,
    _receiver_id_len: i64,
    _receiver_id_ptr: i64,
    _method_names_len: i64,
    _method_names_ptr: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_delete_key(
    _promise_index: i64,
    _public_key_len: i64,
    _public_key_ptr: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_batch_action_delete_account(
    _promise_index: i64,
    _beneficiary_id_len: i64,
    _beneficiary_id_ptr: i64,
) {
}

#[no_mangle]
pub extern "C" fn promise_result(_result_idx: i64, _register_id: i64) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn promise_return(_promise_idx: i64) {}

#[no_mangle]
pub extern "C" fn block_timestamp() -> i64 {
    unsafe {
        return TESTENV
            .as_ref()
            .unwrap()
            .block_timestamp
            .try_into()
            .unwrap();
    }
}

#[no_mangle]
pub extern "C" fn ed25519_verify(
    signature_len: i64,
    signature_ptr: i64,
    message_len: i64,
    message_ptr: i64,
    public_key_len: i64,
    public_key_ptr: i64,
) -> i64 {
    unsafe {
        let signature = Signature::from_bytes(std::slice::from_raw_parts(
            signature_ptr as *const u8,
            signature_len as usize,
        ))
        .unwrap();
        let message = std::slice::from_raw_parts(message_ptr as *const u8, message_len as usize);
        let public_key = ed25519_dalek::PublicKey::from_bytes(std::slice::from_raw_parts(
            public_key_ptr as *const u8,
            public_key_len as usize,
        ))
        .unwrap();
        if public_key.verify_strict(message, &signature).is_ok() {
            1
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_value_return() {
        setup_test_env();
        unsafe {
            let ret_value = "test_value_return";
            near_sdk::env::value_return(ret_value.as_ref());
            assert_eq!(
                std::str::from_utf8(TESTENV.as_ref().unwrap().returned_value.as_ref()).unwrap(),
                ret_value
            );
        }
    }
}
