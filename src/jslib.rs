use crate::viewaccesscontrol::{store_signing_key_for_account, verify_message_signed_by_account};
use near_sdk::{base64, env};
use std::ffi::{CStr, CString};
use std::slice;

extern "C" {
    pub fn create_runtime();
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
    fn JS_GetTypedArrayBuffer(
        ctx: i32,                       // QuickJS context (JSContext*)
        obj: i64, // The JSValueConst representing the typed array (JSValueConst as i64)
        pbyte_offset: *mut usize, // Pointer to store the byte offset (size_t*)
        pbyte_length: *mut usize, // Pointer to store the byte length (size_t*)
        pbytes_per_element: *mut usize, // Pointer to store bytes per element (size_t*)
    ) -> i64;
    fn JS_GetArrayBuffer(
        ctx: i32,          // QuickJS context
        psize: *mut usize, // Pointer to store the buffer size
        obj: i64,          // The JSValue representing the ArrayBuffer
    ) -> *mut u8; //
    fn JS_NewArrayBufferCopy(
        ctx: i32,
        data: *const u8,
        size: usize
    ) -> i64;
}

pub const JS_UNDEFINED: i64 = 0x0000000300000000;
pub const JS_FALSE: i64 = 0x0000000100000000;
pub const JS_TRUE: i64 = 0x0000000100000001;

pub fn arg_to_str(ctx: i32, arg_no: i32, argv: i32) -> String {
    let mut value_len: usize = 0;
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

pub fn arg_to_number(_ctx: i32, arg_no: i32, argv: i32) -> i64 {
    let argv_ptr = (argv + (arg_no * 8)) as *const i64;
    unsafe {
        return *argv_ptr;
    }
}

unsafe fn JS_GetArrayBufferRawData(ctx: i32, jsvalue: i64) -> *mut u8 {
    let mut size: usize = 0;
    let data_ptr = JS_GetArrayBuffer(ctx, &mut size as *mut usize, jsvalue);
    return data_ptr;
}

pub fn arg_to_u8_array(ctx: i32, arg_no: i32, argv: i32) -> Vec<u8> {
    let mut byte_offset: usize = 0;
    let mut byte_length: usize = 0;
    let mut bytes_per_element: usize = 0;
    let argv_ptr = (argv + (arg_no * 8)) as *const i64; // Access the argument as JSValue (i64)

    let array_data: Vec<u8>;
    unsafe {
        // Retrieve the typed array object (Uint8Array)
        let typed_array: i64 = *argv_ptr; // JSValue as a 64-bit integer

        // Call JS_GetTypedArrayBuffer, which returns another JSValue representing the buffer
        let buffer_jsvalue = JS_GetTypedArrayBuffer(
            ctx,
            typed_array,                          // Pass the JSValue (i64)
            &mut byte_offset as *mut usize,       // Offset pointer
            &mut byte_length as *mut usize,       // Length pointer
            &mut bytes_per_element as *mut usize, // Bytes per element pointer
        );

        // Now we need to extract the raw buffer from this new JSValue (buffer_jsvalue)
        if buffer_jsvalue != 0 && byte_length > 0 {
            // Assume we have a function to get the raw buffer from JSValue (this needs to be implemented)
            let data_ptr = JS_GetArrayBufferRawData(ctx, buffer_jsvalue);

            // Convert the raw pointer into a Vec<u8>
            if !data_ptr.is_null() {
                array_data = std::slice::from_raw_parts(data_ptr, byte_length).to_vec();
            } else {
                array_data = Vec::new(); // Handle null case gracefully
            }
        } else {
            array_data = Vec::new(); // If the returned value is invalid or length is zero
        }
    }

    return array_data;
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

fn predecessor_account_id_func(ctx: i32, _this_val: i64, _argc: i32, _argv: i32) -> i64 {
    unsafe {
        let predecessor_account_id = near_sdk::env::predecessor_account_id().to_string();
        let predecessor_account_id_ptr = predecessor_account_id.as_ptr();
        return JS_NewStringLen(
            ctx,
            predecessor_account_id_ptr as i32,
            predecessor_account_id.len(),
        );
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

fn store_signing_key_func(_ctx: i32, _this_val: i64, _argc: i32, argv: i32) -> i64 {
    let expires_timestamp_ms = unsafe { *(argv as *const u64) };
    store_signing_key_for_account(expires_timestamp_ms);
    return JS_UNDEFINED;
}

pub unsafe fn add_function_to_js(
    function_name: &str,
    function_impl: fn(i32, i64, i32, i32) -> i64,
    num_params: i32,
) {
    let function_name_cstr = CString::new(function_name).unwrap();
    js_add_near_host_function(
        function_name_cstr.as_ptr() as i32,
        function_impl as i32,
        num_params,
    );
}

pub fn to_js_string(ctx: i32, str: String) -> i64 {
    let str_ptr = str.as_ptr();

    unsafe {
        return JS_NewStringLen(ctx, str_ptr as i32, str.len());
    }
}

unsafe fn setup_quickjs() {
    create_runtime();
    createNearEnv();

    add_function_to_js(
        "panic",
        |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
            let mut value_len = 0;
            let value_len_ptr: *mut usize = &mut value_len;
            let argv_ptr = argv as *const i64;

            let ptr = JS_ToCStringLen2(ctx, value_len_ptr as i32, *argv_ptr, 0) as *const i8;
            let str = CStr::from_ptr(ptr).to_str().unwrap();
            near_sdk::env::panic_str(str);
        },
        1,
    );
    add_function_to_js("value_return", value_return_func, 1);
    add_function_to_js("input", input_func, 1);
    add_function_to_js(
        "block_timestamp_ms",
        |_ctx: i32, _this_val: i64, _argc: i32, _argv: i32| -> i64 {
            env::block_timestamp_ms() as i64
        },
        1,
    );
    add_function_to_js(
        "current_account_id",
        |ctx: i32, _this_val: i64, _argc: i32, _argv: i32| -> i64 {
            let current_account_id = env::current_account_id().to_string();
            let current_account_id_ptr = current_account_id.as_ptr();
            return JS_NewStringLen(ctx, current_account_id_ptr as i32, current_account_id.len());
        },
        0,
    );
    add_function_to_js("predecessor_account_id", predecessor_account_id_func, 1);
    add_function_to_js("signer_account_id", signer_account_id_func, 1);
    add_function_to_js("verify_signed_message", verify_signed_message_func, 2);
    add_function_to_js("store_signing_key", store_signing_key_func, 1);
    add_function_to_js(
        "base64_encode",
        |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
            return to_js_string(ctx, base64::encode(arg_to_str(ctx, 0, argv)));
        },
        1,
    );
    add_function_to_js(
        "sha256_utf8_to_base64",
        |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
            return to_js_string(
                ctx,
                base64::encode(near_sdk::env::sha256(arg_to_str(ctx, 0, argv).as_bytes())),
            );
        },
        1,
    );
    add_function_to_js(
        "sha256_utf8",
        |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
            let message_sha256 = near_sdk::env::sha256(arg_to_str(ctx, 0, argv).as_bytes());
            JS_NewArrayBufferCopy(
                ctx,
                message_sha256.as_ptr(),  // Pass the pointer to the data (const u8)
                message_sha256.len()          // Length of the data
            )
        },
        1,
    );
    add_function_to_js(
        "ed25519_verify",
        |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
            let signature_vec = arg_to_u8_array(ctx, 0, argv);
            let signature: &[u8; 64] = signature_vec[..].try_into().unwrap();
            let message_vec = arg_to_u8_array(ctx, 1, argv);
            let message: &[u8] = message_vec.as_slice();

            let public_key_vec = arg_to_u8_array(ctx, 2, argv);
            let public_key: &[u8; 32] = public_key_vec[..].try_into().unwrap();

            let result = near_sdk::env::ed25519_verify(signature, message, public_key);
            if result {
                JS_TRUE
            } else {
                JS_FALSE
            }
        },
        1,
    );
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

pub fn compile_js(script: String, modulename: Option<String>) -> Vec<u8> {
    let result: Vec<u8>;
    unsafe {
        create_runtime();
        let mut out_buf_len: usize = 0;
        let out_buf_len_ptr: *mut usize = &mut out_buf_len;
        let is_module = if modulename.is_some() { 1 } else { 0 };
        let filename = if is_module == 1 {
            CString::new(modulename.unwrap()).unwrap()
        } else {
            CString::new("main.js").unwrap()
        };
        let scriptstring = CString::new(script).unwrap();
        let result_ptr = js_compile_to_bytecode(
            filename.as_ptr() as i32,
            scriptstring.as_ptr() as i32,
            out_buf_len_ptr as i32,
            is_module,
        );
        result = slice::from_raw_parts(result_ptr as *mut u8, out_buf_len).to_vec();
    }
    return result;
}

#[cfg(test)]
mod tests {
    use super::{compile_js, js_get_property, js_get_string, run_js, run_js_bytecode};
    use crate::viewaccesscontrol::store_signing_key_for_account;
    use near_sdk::{base64, env::sha256};
    use ed25519_dalek::{ed25519::signature::SignerMut, SigningKey};

    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_string_eq, set_input, set_signer_account_id,
        setup_test_env,
    };
    use rand::rngs::OsRng;
    use std::ffi::CStr;

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
        store_signing_key_for_account(24 * 60 * 60 * 1000);
        run_js("env.value_return(env.verify_signed_message('invitation1','LtXiPcOxOC8n5/qiICscp3P5Ku8ymC3gj1eYJuq8GFR9co2pZYwbWLBiu5CrtVFtvmeWwMzOIkp4tJaosJ40Dg==', 'alice.near') ? 'valid' : 'invalid')".to_string());
        assert_latest_return_value_string_eq("valid".to_string());
    }

    #[test]
    fn test_parse_object() {
        setup_test_env();
        let bytecode = compile_js(
            "(function () { return {hello: 'world', thenumberis: 42}; })()".to_string(),
            None,
        );
        let result = run_js_bytecode(bytecode);
        unsafe {
            assert_eq!(42, js_get_property(result, "thenumberis".as_ptr() as i32));
            let stringjsval = js_get_property(result, "hello".as_ptr() as i32);
            let str = CStr::from_ptr(js_get_string(stringjsval) as *const i8)
                .to_str()
                .unwrap();
            assert_eq!("world", str);
        }
    }

    #[test]
    fn test_base64_encode() {
        setup_test_env();
        let bytecode = compile_js(
            "(function () { return { val: env.base64_encode('hello')}; })()".to_string(),
            None,
        );
        let result = run_js_bytecode(bytecode);
        unsafe {
            let stringjsval = js_get_property(result, "val".as_ptr() as i32);
            let str = CStr::from_ptr(js_get_string(stringjsval) as *const i8)
                .to_str()
                .unwrap();
            assert_eq!("aGVsbG8=", str);
        }
    }

    #[test]
    fn test_sha256_utf8_to_base64() {
        setup_test_env();
        let bytecode = compile_js(
            "(function () { return { val: env.sha256_utf8_to_base64('hello\\n')}; })()".to_string(),
            None,
        );
        let result = run_js_bytecode(bytecode);
        unsafe {
            let stringjsval = js_get_property(result, "val".as_ptr() as i32);
            let str = CStr::from_ptr(js_get_string(stringjsval) as *const i8)
                .to_str()
                .unwrap();
            assert_eq!(
                base64::encode(
                    hex::decode("5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03")
                        .unwrap()
                ),
                str
            );
        }
    }

    #[test]
    fn test_ed25519_verify_message() {
        let mut csprng = OsRng;
        let mut signing_key = SigningKey::generate(&mut csprng);
        let message_hashed = sha256(b"Hello");
        let signature = signing_key.sign(message_hashed[..].try_into().unwrap());
        let script = format!("
            (function () {{ 
                let signature = new Uint8Array({:?});
                let message = new Uint8Array(env.sha256_utf8(\"Hello\"));
                let publicKey = new Uint8Array({:?});
                return env.ed25519_verify(signature, message, publicKey) ? 1 : 0;
            }})();
        ", signature.to_bytes(), signing_key.verifying_key().as_bytes());

        let bytecode = compile_js(script, None);
        let result = run_js_bytecode(bytecode);

        assert_eq!(1, result);
    }

    #[test]
    fn test_ed25519_verify() {
        setup_test_env();
        let bytecode = compile_js(
            "(function () { 
                let signature = new Uint8Array([
                    202, 190, 247,  74, 243, 111,  52, 105,  50, 114, 227,
                    162,  48,  43, 196,  41, 250, 186, 200,  69, 193,  79,
                    125, 103,  18,  55, 153,  32,  27, 210, 186, 142, 160,
                    121, 163,  87, 169, 246, 125, 204, 148, 183, 143,  86,
                    59, 181, 174, 224, 113,  26, 160,  25, 137, 186,  65,
                    196,   1, 137, 143, 184, 179,  90,  83,   0
                ]);
                let message = new Uint8Array([
                    116, 104, 101,  32, 101, 120, 112,
                    101,  99, 116, 101, 100,  32, 109,
                    101, 115, 115,  97, 103, 101,  32,
                    116, 111,  32,  98, 101,  32, 115,
                    105, 103, 110, 101, 100
                ]);
                let publicKey = new Uint8Array([
                    85, 107, 80, 196, 145, 120, 98, 16, 245, 69, 9, 42, 212, 6, 131, 229, 36, 235,
                    122, 199, 84, 4, 164, 55, 218, 190, 147, 17, 144, 195, 95, 176,
                ]);
                return env.ed25519_verify(signature, message, publicKey) ? 1 : 0;
            })()"
                .to_string(),
            None,
        );
        let result = run_js_bytecode(bytecode);

        assert_eq!(1, result);
    }
}
