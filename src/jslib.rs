use std::ffi::CString;
use std::slice;

extern "C" {
    fn create_runtime();
    fn js_eval(filename: i32, script: i32, is_module: i32) -> i32;
    fn js_eval_bytecode(buf: *const u8, buf_len: usize) -> i32;
    fn js_compile_to_bytecode(filename: i32, source: i32, out_buf_len: i32, module: i32) -> i32;
    fn createNearEnv();
    fn js_add_near_host_function(name: i32, func: i32, length: i32);
    fn JS_ToCStringLen2(ctx: i32, value_len_ptr: i32, val: i64, b: i32) -> i32;
}

pub const JS_UNDEFINED: i64 = 0x0000000300000000;

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

pub fn run_js(script: String) -> i32 {
    let result: i32;
    let filename = CString::new("main.js").unwrap();
    let scriptstring = CString::new(script).unwrap();

    let value_return = CString::new("value_return").unwrap();

    unsafe {
        create_runtime();
        createNearEnv();
        js_add_near_host_function(value_return.as_ptr() as i32, value_return_func as i32, 1);

        result = js_eval(filename.as_ptr() as i32, scriptstring.as_ptr() as i32, 0);
    }
    return result;
}

pub fn run_js_bytecode(bytecode: Vec<u8>) -> i32 {
    let result: i32;
    let value_return = CString::new("value_return").unwrap();

    unsafe {
        create_runtime();
        createNearEnv();
        js_add_near_host_function(value_return.as_ptr() as i32, value_return_func as i32, 1);

        result = js_eval_bytecode(bytecode.as_ptr(), bytecode.len());
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
    use super::run_js;

    use crate::tests::testenv::setup_test_env;

    #[test]
    fn test_value_return_should_return_undefined() {
        setup_test_env();
        assert_eq!(
            run_js("(env.value_return('hello') == undefined ? 1 : 0)".to_string()),
            1
        );
    }
}
