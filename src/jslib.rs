
extern "C" {
    fn create_runtime();
    fn js_eval(filename: i32, script: i32, is_module: i32) -> i32;
    fn js_eval_bytecode(buf: *const u8, buf_len: usize) -> i32;
}

pub fn run_js(script: String) -> i32 {    
    let result:i32;
    unsafe {
        create_runtime();
        result = js_eval("main.js".as_ptr() as i32,
                script.as_ptr() as i32, 0);
    }
    return result;
}

pub fn run_js_bytecode(bytecode: Vec<u8>) -> i32 {    
    let result:i32;
    unsafe {
        create_runtime();
        result = js_eval_bytecode(bytecode.as_ptr(),bytecode.len());
    }
    return result;
}

