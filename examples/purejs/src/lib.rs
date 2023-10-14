use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env, near_bindgen};
use quickjs_rust_near::jslib::{
    add_function_to_js, arg_to_str, compile_js, js_call_function, load_js_bytecode, to_js_string,
};
use std::ffi::CString;

const QUICKJS_BYTECODE: &[u8] = &[
    2, 6, 16, 99, 111, 110, 116, 114, 97, 99, 116, 10, 104, 101, 108, 108, 111, 10, 112, 97, 114, 115, 101, 6, 101, 110, 118, 24, 118, 97, 108, 117, 101, 95, 114, 101, 116, 117, 114, 110, 12, 104, 101, 108, 108, 111, 32, 15, 188, 3, 0, 1, 0, 0, 190, 3, 0, 0, 14, 0, 6, 1, 160, 1, 0, 0, 0, 1, 1, 1, 8, 0, 190, 3, 0, 1, 8, 234, 5, 192, 0, 225, 41, 41, 188, 3, 1, 4, 1, 0, 7, 8, 14, 67, 6, 1, 190, 3, 0, 1, 0, 4, 0, 0, 58, 1, 108, 1, 0, 48, 97, 0, 0, 56, 155, 0, 0, 0, 66, 224, 0, 0, 0, 56, 225, 0, 0, 0, 66, 88, 0, 0, 0, 36, 0, 0, 36, 1, 0, 65, 54, 0, 0, 0, 201, 56, 225, 0, 0, 0, 66, 226, 0, 0, 0, 4, 227, 0, 0, 0, 98, 0, 0, 157, 36, 1, 0, 41, 188, 3, 1, 3, 18, 163, 113, 
];

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct Contract {}

#[near_bindgen]
impl Contract {
    pub fn hello(&self) {
        let jsmod = load_js_bytecode(QUICKJS_BYTECODE.as_ptr(), QUICKJS_BYTECODE.len());

        unsafe {
            let function_name_cstr = CString::new("hello").unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    use quickjs_rust_near_testenv::testenv::{
        set_input, assert_latest_return_value_string_eq, setup_test_env
    };

    #[test]
    fn test_hello() {
        setup_test_env();
        let contract = Contract::default();

        set_input(
            "{\"name\": \"peter\"}"
                .try_into()
                .unwrap(),
        );
        contract.hello();
        assert_latest_return_value_string_eq(
            r#"hello peter"#.to_owned(),
        );
    }
}
