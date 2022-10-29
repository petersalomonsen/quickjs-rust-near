use std::ffi::CString;
use std::slice;
use crate::viewaccesscontrol::{verify_message_signed_by_account};

extern "C" {
    fn create_runtime();
    fn js_eval(filename: i32, script: i32, is_module: i32) -> i32;
    fn js_eval_bytecode(buf: *const u8, buf_len: usize) -> i64;
    fn js_compile_to_bytecode(filename: i32, source: i32, out_buf_len: i32, module: i32) -> i32;
    pub fn js_load_bytecode(buf: *const u8, buf_len: usize) -> i64;
    pub fn js_call_function(mod_obj: i64, function_name: i32) -> i64;
    pub fn js_get_property(val: i64, propertyname: i32) -> i64;
    pub fn js_get_string(val: i64) -> i32;
    fn createNearEnv();
    fn js_add_near_host_function(name: i32, func: i32, length: i32);
    fn JS_ToCStringLen2(ctx: i32, value_len_ptr: i32, val: i64, b: i32) -> i32;
    fn JS_NewStringLen(ctx: i32, buf: i32, buf_len: usize) -> i64;
}

pub const JS_UNDEFINED: i64 = 0x0000000300000000;
pub const JS_FALSE: i64 = 0x0000000100000000;
pub const JS_TRUE: i64 = 0x0000000100000001;

fn arg_to_str(ctx: i32, arg_no: i32, argv: i32) -> String {
    let mut value_len: usize= 0;
    let value_len_ptr: *mut usize = &mut value_len as *mut usize;
    let argv_ptr = (argv + (arg_no * 8)) as *const i64;

    let value_string: String;
    let value_bytes: Vec<u8>;
    unsafe {
        let value_ptr = JS_ToCStringLen2(ctx, value_len_ptr as i32, *argv_ptr, 0) as *const u8;
        value_bytes = std::slice::from_raw_parts(value_ptr, value_len).to_vec();
    }
    value_string = String::from_utf8(value_bytes).unwrap();
    return value_string;
}

/**
 * From near_sdk_js

(type $t12 (func (param i32 i64 i64 i32) (result i64)))

static JSValue near_value_return(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
  const char *value_ptr;
  size_t value_len;

  value_ptr = JS_ToCStringLenRaw(ctx, &value_len, argv[0]);
  value_return(value_len, (uint64_t)value_ptr);
  return JS_UNDEFINED;
}
*/

fn value_return_func(ctx: i32, _this_val: i64, _argc: i32, argv: i32) -> i64 {
    let mut value_len = 0;
    let value_len_ptr: *mut usize = &mut value_len as *mut usize;
    let argv_ptr = argv as *const i64;

    unsafe {
        let value_ptr = JS_ToCStringLen2(ctx, value_len_ptr as i32, *argv_ptr, 0) as *const u8;
        near_sdk::env::value_return(std::slice::from_raw_parts(value_ptr, value_len));
    }

    return JS_UNDEFINED;
}

fn input_func(ctx: i32, _this_val: i64, _argc: i32, _argv: i32) -> i64 {
    let inputbytes = near_sdk::env::input().unwrap();
    let inputbytes_ptr = inputbytes.as_ptr();

    unsafe {
        return JS_NewStringLen(ctx, inputbytes_ptr as i32, inputbytes.len());
    }
}

fn signer_account_id_func(ctx: i32, _this_val: i64, _argc: i32, _argv: i32) -> i64 {
    unsafe {
        let signer_account_id = near_sdk::env::signer_account_id().to_string();
        let signer_account_id_ptr = signer_account_id.as_ptr();
        return JS_NewStringLen(ctx, signer_account_id_ptr as i32, signer_account_id.len());
    }
}

fn verify_signed_message_func(ctx: i32, _this_val: i64, _argc: i32, argv: i32) -> i64 {
    let message = arg_to_str(ctx, 0, argv);
    let signature = arg_to_str(ctx, 1, argv);
    let account = arg_to_str(ctx, 2, argv);
    if verify_message_signed_by_account(message, signature, account) {
        return JS_TRUE;
    } else {
        return JS_FALSE;
    }
}

unsafe fn setup_quickjs() {
    create_runtime();
    createNearEnv();

    let value_return_name = CString::new("value_return").unwrap();
    js_add_near_host_function(
        value_return_name.as_ptr() as i32,
        value_return_func as i32,
        1,
    );

    let input_name = CString::new("input").unwrap();
    js_add_near_host_function(input_name.as_ptr() as i32, input_func as i32, 1);

    let signer_account_id_name = CString::new("signer_account_id").unwrap();
    js_add_near_host_function(
        signer_account_id_name.as_ptr() as i32,
        signer_account_id_func as i32,
        1,
    );

    let verify_signed_message_name = CString::new("verify_signed_message").unwrap();
    js_add_near_host_function(verify_signed_message_name.as_ptr() as i32,
            verify_signed_message_func as i32, 2);
}

pub fn run_js(script: String) -> i32 {
    let result: i32;
    let filename = CString::new("main.js").unwrap();
    let scriptstring = CString::new(script).unwrap();

    unsafe {
        setup_quickjs();
        result = js_eval(filename.as_ptr() as i32, scriptstring.as_ptr() as i32, 0);
    }
    return result;
}

pub fn run_js_bytecode(bytecode: Vec<u8>) -> i64 {
    let result: i64;

    unsafe {
        setup_quickjs();
        result = js_eval_bytecode(bytecode.as_ptr(), bytecode.len());
    }
    return result;
}

pub fn load_js_bytecode(bytecode: *const u8, len: usize) -> i64 {
    let result: i64;

    unsafe {
        setup_quickjs();
        result = js_load_bytecode(bytecode, len);
    }
    return result;
}

pub fn compile_js(script: String) -> Vec<u8> {
    let result: Vec<u8>;
    unsafe {
        create_runtime();
        let mut out_buf_len: usize = 0;
        let out_buf_len_ptr: *mut usize = &mut out_buf_len;
        let filename = CString::new("main.js").unwrap();
        let scriptstring = CString::new(script).unwrap();
        let result_ptr = js_compile_to_bytecode(
            filename.as_ptr() as i32,
            scriptstring.as_ptr() as i32,
            out_buf_len_ptr as i32,
            0,
        );
        result = slice::from_raw_parts(result_ptr as *mut u8, out_buf_len).to_vec();
    }
    return result;
}

#[cfg(test)]
mod tests {
    use super::{run_js, compile_js, run_js_bytecode, js_get_property, js_get_string};
    use std::ffi::CStr;
    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_string_eq, set_input, set_signer_account_id,
        setup_test_env
    };
    use crate::viewaccesscontrol::{store_signing_key_for_account};

    #[test]
    fn test_value_return_should_return_undefined() {
        setup_test_env();
        assert_eq!(
            run_js("(env.value_return('hello') == undefined ? 1 : 0)".to_string()),
            1
        );
    }

    #[test]
    fn test_input_func() {
        setup_test_env();
        set_input("{\"a\":   \"b\"}".to_string().into_bytes());
        run_js("env.value_return(JSON.stringify(JSON.parse(env.input())));".to_string());
        assert_latest_return_value_string_eq("{\"a\":\"b\"}".to_string());
    }

    #[test]
    fn test_signer_account_id_func() {
        setup_test_env();
        set_signer_account_id(alice());
        run_js("env.value_return(env.signer_account_id())".to_string());
        assert_latest_return_value_string_eq(alice().to_string());
    }

    #[test]
    fn test_verify_signed_message_func() {
        setup_test_env();
        set_signer_account_id(alice());
        store_signing_key_for_account();
        run_js("env.value_return(env.verify_signed_message('invitation1','LtXiPcOxOC8n5/qiICscp3P5Ku8ymC3gj1eYJuq8GFR9co2pZYwbWLBiu5CrtVFtvmeWwMzOIkp4tJaosJ40Dg==', 'alice.near') ? 'valid' : 'invalid')".to_string());
        assert_latest_return_value_string_eq("valid".to_string());
    }

    #[test]
    fn test_parse_object() {
        let bytecode = compile_js("(function () { return {'hello': 'world', 'thenumberis': 42}; })()".to_string());
        let result = run_js_bytecode(bytecode);
        unsafe {
            assert_eq!(42, js_get_property(result, "thenumberis".as_ptr() as i32));
            let stringjsval = js_get_property(result, "hello".as_ptr() as i32);
            let str = CStr::from_ptr(js_get_string(stringjsval) as *const i8).to_str().unwrap();
            assert_eq!("world", str);
        }
    }
}
