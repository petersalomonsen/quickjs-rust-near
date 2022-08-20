use lazy_static::lazy_static;
use std::{collections::HashMap, sync::Mutex};

/*
  Mock of the following Contract WebAssembly imports

  (type $t40 (func (result i32)))
  (type $t41 (func (param i32 f64 i32 i32 i32 i32) (result i32)))
  (type $t42 (func (param i64 i64)))
  (type $t43 (func (param i64) (result i64)))
  (type $t44 (func (param i64)))
  (type $t45 (func (param i64 i64 i64 i64 i64) (result i64)))
  (type $t46 (func (param i64 i64 i64) (result i64)))

  (import "env" "read_register" (func $read_register (type $t42)))
  (import "env" "register_len" (func $register_len (type $t43)))
  (import "env" "signer_account_id" (func $signer_account_id (type $t44)))
  (import "env" "input" (func $input (type $t44)))
  (import "env" "attached_deposit" (func $attached_deposit (type $t44)))
  (import "env" "value_return" (func $value_return (type $t42)))
  (import "env" "panic_utf8" (func $panic_utf8 (type $t42)))
  (import "env" "log_utf8" (func $log_utf8 (type $t42)))
  (import "env" "storage_write" (func $storage_write (type $t45)))
  (import "env" "storage_read" (func $storage_read (type $t46)))
*/

lazy_static! {
    static ref REGISTERS: Mutex<HashMap<i64, Vec<u8>>> = Mutex::new(HashMap::new());
}

#[no_mangle]
pub extern "C" fn read_register(register_id: i64, data_ptr: i64) {
    let registers = REGISTERS.lock().unwrap();
    let src = registers.get(&register_id).unwrap().to_vec();

    unsafe {
        std::ptr::copy(src.as_ptr(), data_ptr as *mut u8, src.len());
    }
}

#[no_mangle]
pub extern "C" fn register_len(register_id: i64) -> i64 {
    let registers = REGISTERS.lock().unwrap();
    return (registers.get(&register_id).unwrap().to_vec()).len() as i64;
}

#[no_mangle]
pub extern "C" fn signer_account_id(register: i64) {
    let mut registers = REGISTERS.lock().unwrap();
    registers.insert(register, "test.near".to_string().into_bytes());
}

#[no_mangle]
pub extern "C" fn input(_p1: i64) {}

#[no_mangle]
pub extern "C" fn attached_deposit(_p1: i64) {}

#[no_mangle]
pub extern "C" fn value_return(_p1: i64, _p2: i64) {}

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
pub extern "C" fn storage_write(_p1: i64, _p2: i64, _p3: i64, _p4: i64, _p5: i64) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn storage_read(_p1: i64, _p2: i64, _p3: i64) -> i64 {
    return 0;
}
