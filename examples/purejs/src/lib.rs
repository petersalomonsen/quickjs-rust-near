use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::near_bindgen;
use quickjs_rust_near::jslib::{
    js_call_function, load_js_bytecode, create_runtime
};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, Default)]
pub struct Contract {}

#[near_bindgen]
impl Contract {
    pub fn some_js_function(&self) {
        unsafe {
            create_runtime();
            let jsmod = load_js_bytecode(123456789 as *const u8, 987654321);            
            js_call_function(jsmod, 456123987 as i32);
        }
    }
}
