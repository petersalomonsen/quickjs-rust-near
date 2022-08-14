extern "C" {
    fn create_runtime();
    fn js_eval(filename: i32, script: i32, is_module: i32) -> i32;
    fn js_eval_bytecode(buf: *const u8, buf_len: usize) -> i32;
    fn js_compile_to_bytecode(filename: i32, source: i32, out_buf_len: i32, module: i32) -> i32;
}

pub fn run_js(script: String) -> i32 {
    let result: i32;
    unsafe {
        create_runtime();
        result = js_eval("main.js".as_ptr() as i32, script.as_ptr() as i32, 0);
    }
    return result;
}

pub fn run_js_bytecode(bytecode: Vec<u8>) -> i32 {
    let result: i32;
    unsafe {
        create_runtime();
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
        let result_ptr = js_compile_to_bytecode(
            "main.js".as_ptr() as i32,
            script.as_ptr() as i32,
            out_buf_len_ptr as i32,
            0
        );
        result = Vec::from_raw_parts(result_ptr as *mut u8, out_buf_len, out_buf_len);
    }
    return result;
}
