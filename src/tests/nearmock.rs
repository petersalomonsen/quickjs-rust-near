/*
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
#[no_mangle]
pub extern "C" fn read_register(_p1: i64, _p2: i64) {}

#[no_mangle]
pub extern "C" fn register_len(_p1: i64) -> i64 {
    return 0;
}

#[no_mangle]
pub extern "C" fn signer_account_id(_p1: i64) {}

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
