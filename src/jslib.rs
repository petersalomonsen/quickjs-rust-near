
extern "C" {
    fn create_runtime();
    fn js_eval(filename: *const libc::c_char, script: *const libc::c_char, is_module: i32) -> i32;
}

pub fn run_js(script: String) -> i32 {    
    let result:i32;
    let c_script = std::ffi::CString::new(script).unwrap();
    let filename = std::ffi::CString::new("main.js").unwrap();
    unsafe {
        create_runtime();
        result = js_eval(filename.as_ptr(),
                c_script.as_ptr(), 0);
    }
    return result;
}