use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env, near_bindgen};
use quickjs_rust_near::jslib::{
    add_function_to_js, arg_to_str, compile_js, js_call_function, load_js_bytecode, to_js_string,
};
use std::ffi::CString;

const JS_BYTECODE_STORAGE_KEY: &[u8] = b"JS";
const JS_CONTENT_RESOURCE_PREFIX: &str = "JSC_";

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct Contract {}

static mut CONTRACT_REF: *const Contract = 0 as *const Contract;

#[near_bindgen]
impl Contract {
    unsafe fn add_js_functions(&self) {
        CONTRACT_REF = self as *const Contract;
        add_function_to_js(
            "get_content_base64",
            |ctx: i32, _this_val: i64, _argc: i32, argv: i32| -> i64 {
                let mut prefixed_key = JS_CONTENT_RESOURCE_PREFIX.to_owned();
                prefixed_key.push_str(arg_to_str(ctx, 0, argv).as_str());
                let data = env::storage_read(&prefixed_key.as_bytes()).unwrap();
                return to_js_string(ctx, base64::encode(data));
            },
            1,
        );
    }

    fn load_js_bytecode(&self) -> i64 {
        let bytecode = env::storage_read(JS_BYTECODE_STORAGE_KEY).unwrap();
        return load_js_bytecode(bytecode.as_ptr(), bytecode.len());
    }

    fn store_js_bytecode(&self, bytecode: Vec<u8>) {
        env::storage_write(JS_BYTECODE_STORAGE_KEY, &bytecode);
    }

    pub fn call_js_func(&self, function_name: String) {
        let jsmod = self.load_js_bytecode();

        unsafe {
            self.add_js_functions();
            let function_name_cstr = CString::new(function_name).unwrap();
            js_call_function(jsmod, function_name_cstr.as_ptr() as i32);
        }
    }

    pub fn web4_get(&self) {
        let jsmod = self.load_js_bytecode();
        let web4_get_str = CString::new("web4_get").unwrap();
        unsafe {
            self.add_js_functions();
            js_call_function(jsmod, web4_get_str.as_ptr() as i32);
        }
    }

    pub fn post_quickjs_bytecode(&mut self, bytecodebase64: String) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Unauthorized"
        );
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        self.store_js_bytecode(bytecode.unwrap());
    }

    pub fn post_javascript(&mut self, javascript: String) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Unauthorized"
        );
        self.store_js_bytecode(compile_js(javascript, Some("main.js".to_string())));
    }

    pub fn post_content(&mut self, key: String, valuebase64: String) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Unauthorized"
        );
        let value = base64::decode(&valuebase64).unwrap();
        let mut prefixed_key = JS_CONTENT_RESOURCE_PREFIX.to_owned();
        prefixed_key.push_str(key.as_str());
        env::storage_write(&prefixed_key.as_bytes(), &value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use quickjs_rust_near::jslib::compile_js;
    use quickjs_rust_near_testenv::testenv::{
        alice, assert_latest_return_value_string_eq, bob,
        set_current_account_id, set_input,
        set_predecessor_account_id, setup_test_env,
    };
    static CONTRACT_JS: &'static [u8] = include_bytes!("contract.js");

    #[test]
    fn test_web4_get() {
        setup_test_env();
        set_current_account_id(alice());
        set_predecessor_account_id(alice());
        set_input(
            "{\"request\": {\"path\": \"/index.html\"}}"
                .try_into()
                .unwrap(),
        );
        let mut contract = Contract::default();
        let bytecode = compile_js(
            String::from_utf8(CONTRACT_JS.to_vec()).unwrap(),
            Some("main.js".to_string()),
        );
        let bytecodebase64 = base64::encode(bytecode);

        contract.post_quickjs_bytecode(bytecodebase64);
        contract.post_content(
            "/index.html".to_string(),
            base64::encode("<html><body>hello</body></html>".to_string()),
        );
        contract.web4_get();
        assert_latest_return_value_string_eq(
            r#"{"contentType":"text/html; charset=UTF-8","body":"PGh0bWw+PGJvZHk+aGVsbG88L2JvZHk+PC9odG1sPg=="}"#
                .to_owned(),
        );
    }

    #[test]
    fn test_store_content() {
        setup_test_env();
        set_predecessor_account_id(bob());
        set_current_account_id(bob());

        let mut contract = Contract::default();
        contract.post_javascript(
            "
        export function get_content_base64() {
            env.value_return(env.get_content_base64('/files/testfile.js'));
        }
        "
            .to_string(),
        );
        contract.post_content(
            "/files/testfile.js".to_string(),
            base64::encode(CONTRACT_JS),
        );
        contract.call_js_func("get_content_base64".to_string());
        assert_latest_return_value_string_eq(base64::encode(CONTRACT_JS));
    }
}
