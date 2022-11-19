use lazy_static::lazy_static;
use near_sdk::{AccountId, Balance, PublicKey};
use sha2::Digest;
use std::io::{self, Write};
use std::sync::Once;
use std::{collections::HashMap, sync::Mutex};

const EVICTED_REGISTER: i64 = (u64::MAX - 1) as i64;

#[allow(dead_code)]
pub fn alice() -> AccountId {
    AccountId::new_unchecked("alice.near".to_string())
}

#[allow(dead_code)]
pub fn bob() -> AccountId {
    AccountId::new_unchecked("bob.near".to_string())
}

#[allow(dead_code)]
pub fn carol() -> AccountId {
    AccountId::new_unchecked("carol.near".to_string())
}

struct TestEnv {
    block_timestamp: u64,
    signer_account_id: AccountId,
    signer_account_pk: PublicKey,
    current_account_id: AccountId,
    predecessor_account_id: AccountId,
    attached_deposit: Balance,
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
            attached_deposit: 0,
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

lazy_static! {
    static ref REGISTERS: Mutex<HashMap<i64, Vec<u8>>> = Mutex::new(HashMap::new());
    static ref STORAGE: Mutex<HashMap<Vec<u8>, Vec<u8>>> = Mutex::new(HashMap::new());
    static ref INIT: Once = Once::new();
    static ref TESTENV: Mutex<TestEnv> = Mutex::new(TestEnv::new());
}

pub fn setup_test_env() {
    INIT.call_once(|| {
        std::panic::set_hook(Box::new(|panic_info| {
            let _ = writeln!(io::stderr(), "{}", panic_info);
        }));
    });
}

#[allow(dead_code)]
pub fn set_signer_account_id(account_id: AccountId) {
    TESTENV.lock().unwrap().signer_account_id = account_id;
}

#[allow(dead_code)]
pub fn set_signer_account_pk(pk: PublicKey) {
    TESTENV.lock().unwrap().signer_account_pk = pk;
}

#[allow(dead_code)]
pub fn set_current_account_id(account_id: AccountId) {
    TESTENV.lock().unwrap().current_account_id = account_id;
}

#[allow(dead_code)]
pub fn set_predecessor_account_id(account_id: AccountId) {
    TESTENV.lock().unwrap().predecessor_account_id = account_id;
}

#[allow(dead_code)]
pub fn set_input(input: Vec<u8>) {
    TESTENV.lock().unwrap().input = input;
}

pub fn set_attached_deposit(deposit: Balance) {
    TESTENV.lock().unwrap().attached_deposit = deposit;
}

pub fn set_block_timestamp(timestamp_nanos: u64) {
    TESTENV.lock().unwrap().block_timestamp = timestamp_nanos;
}

#[no_mangle]
pub extern "C" fn read_register(register_id: i64, data_ptr: i64) {
    let registers = REGISTERS.lock().unwrap();
    let val = registers.get(&register_id);

    if val.is_some() {
        let src = val.unwrap().to_vec();

        unsafe {
            std::ptr::copy(src.as_ptr(), data_ptr as *mut u8, src.len());
        }
    }
}

#[no_mangle]
pub extern "C" fn register_len(register_id: i64) -> i64 {
    let registers = REGISTERS.lock().unwrap();
    let val = registers.get(&register_id);

    if val.is_some() {
        return (val.unwrap().to_vec()).len() as i64;
    } else {
        return u64::MAX as i64;
    }
}

#[no_mangle]
pub extern "C" fn signer_account_id(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(
        register,
        TESTENV
            .lock()
            .unwrap()
            .signer_account_id
            .to_string()
            .into_bytes(),
    );
}

#[no_mangle]
pub extern "C" fn signer_account_pk(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(
        register,
        TESTENV
            .lock()
            .unwrap()
            .signer_account_pk
            .as_bytes()
            .to_vec(),
    );
}

#[no_mangle]
pub extern "C" fn current_account_id(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(
        register,
        TESTENV
            .lock()
            .unwrap()
            .current_account_id
            .to_string()
            .into_bytes(),
    );
}

#[no_mangle]
pub extern "C" fn predecessor_account_id(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(
        register,
        TESTENV
            .lock()
            .unwrap()
            .predecessor_account_id
            .to_string()
            .into_bytes(),
    );
}

#[no_mangle]
pub extern "C" fn input(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(register, TESTENV.lock().unwrap().input.to_vec());
}

#[no_mangle]
pub extern "C" fn attached_deposit(data_ptr: i64) {
    let src = TESTENV
        .lock()
        .unwrap()
        .attached_deposit
        .to_le_bytes()
        .to_vec();
    unsafe {
        std::ptr::copy(src.as_ptr(), data_ptr as *mut u8, src.len());
    }
}

#[no_mangle]
pub extern "C" fn value_return(value_len: i64, value_ptr: i64) {
    let bufptr: *const u8 = value_ptr as *const u8;
    let buflen: usize = value_len as usize;
    unsafe {
        TESTENV.lock().unwrap().returned_value =
            std::slice::from_raw_parts(bufptr, buflen).to_vec();
    }
}

#[no_mangle]
pub extern "C" fn panic_utf8(_p1: i64, _p2: i64) {}

#[no_mangle]
pub extern "C" fn log_utf8(_len: i64, _ptr: i64) {
    let bufptr: *const u8 = _ptr as *const u8;
    let buflen: usize = _len as usize;
    unsafe {
        let str = std::str::from_utf8_unchecked(std::slice::from_raw_parts(bufptr, buflen));
        println!("{}", str);
    }
}

#[no_mangle]
pub extern "C" fn storage_has_key(key_len: i64, key_ptr: i64) -> i64 {
    let keyptr: *const u8 = key_ptr as *const u8;
    let keylen: usize = key_len as usize;
    unsafe {
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        return if STORAGE.lock().unwrap().contains_key(&key) {
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
    let keyptr: *const u8 = key_ptr as *const u8;
    let keylen: usize = key_len as usize;
    let valueptr: *const u8 = value_ptr as *const u8;
    let valuelen: usize = value_len as usize;
    let mut registers = REGISTERS.lock().unwrap();
    unsafe {
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        let val = std::slice::from_raw_parts(valueptr, valuelen).to_vec();
        let evicted = STORAGE.lock().unwrap().insert(key, val);
        if evicted.is_some() {
            registers.insert(EVICTED_REGISTER as i64, evicted.unwrap());
            return 1;
        } else {
            return 0;
        }
    }
}

#[no_mangle]
pub extern "C" fn storage_read(key_len: i64, key_ptr: i64, register_id: i64) -> i64 {
    let keyptr: *const u8 = key_ptr as *const u8;
    let keylen: usize = key_len as usize;
    let mut registers = REGISTERS.lock().unwrap();
    let storage = STORAGE.lock().unwrap();
    unsafe {
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        if storage.contains_key(&key) {
            let ret = storage.get(&key).unwrap().to_vec();
            registers.insert(register_id, ret);
            return 1;
        } else {
            return 0;
        }
    }
}

#[no_mangle]
pub extern "C" fn storage_remove(key_len: i64, key_ptr: i64, register_id: i64) -> i64 {
    let keyptr: *const u8 = key_ptr as *const u8;
    let keylen: usize = key_len as usize;
    let mut registers = REGISTERS.lock().unwrap();
    let mut storage = STORAGE.lock().unwrap();
    unsafe {
        let key = std::slice::from_raw_parts(keyptr, keylen).to_vec();
        if storage.contains_key(&key) {
            let ret = storage.remove(&key).unwrap().to_vec();
            registers.insert(register_id, ret);
            return 1;
        } else {
            return 0;
        }
    }
}

pub fn assert_latest_return_value_contains(value_to_be_contained: String) {
    let latest_return_value = std::str::from_utf8(TESTENV.lock().unwrap().returned_value.as_ref())
        .unwrap()
        .to_string();
    assert_eq!(latest_return_value.contains(&value_to_be_contained), true, "latest return value should contain {}, but was {}",value_to_be_contained,latest_return_value);
}

pub fn assert_latest_return_value_string_eq(expected_return_value: String) {
    assert_eq!(
        std::str::from_utf8(TESTENV.lock().unwrap().returned_value.as_ref()).unwrap(),
        expected_return_value
    );
}

#[no_mangle]
pub extern "C" fn storage_usage() -> i64 {
    return STORAGE
        .lock()
        .unwrap()
        .values()
        .map(|x| x.len() as i64)
        .sum();
}

#[no_mangle]
pub extern "C" fn prepaid_gas() -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn sha256(value_len: i64, value_ptr: i64, register_id: i64) {
    let valueptr: *const u8 = value_ptr as *const u8;
    let valuelen: usize = value_len as usize;
    let mut registers = REGISTERS.lock().unwrap();
    unsafe {
        let value = std::slice::from_raw_parts(valueptr, valuelen).to_vec();

        let value_hash = sha2::Sha256::digest(&value);

        registers.insert(register_id, value_hash.as_slice().to_vec());
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
    return TESTENV.lock().unwrap().block_timestamp.try_into().unwrap();
}

#[cfg(test)]
mod tests {
    use super::TESTENV;

    #[test]
    fn test_value_return() {
        let ret_value = "test_value_return";
        near_sdk::env::value_return(ret_value.as_ref());
        assert_eq!(
            std::str::from_utf8(TESTENV.lock().unwrap().returned_value.as_ref()).unwrap(),
            ret_value
        );
    }
}
