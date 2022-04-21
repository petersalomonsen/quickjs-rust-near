
extern "C" {
    fn js_eval(script: *const libc::c_char) -> i32;
}

pub fn run_js(script: String) -> i32 {
    let result:i32;
    let c_script = std::ffi::CString::new(script);
    unsafe {
        result = js_eval(c_script.unwrap().as_ptr());
    }
    return result;
}