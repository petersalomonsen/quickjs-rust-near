use std::collections::HashMap;
use near_sdk::{env, near_bindgen, base64};
use near_sdk::borsh::{self, BorshDeserialize,BorshSerialize};
mod jslib;
mod wasimock;

#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Scripts {
    scripts: HashMap<String, Vec<u8>>
}

#[near_bindgen]
impl Scripts {
    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }

    pub fn run_bytecode(&self, bytecodebase64: String) -> String {
        let bytecode:Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        return jslib::run_js_bytecode(bytecode.unwrap()).to_string();
    }

    pub fn submit_script(&mut self, script: String) {        
        let compiled = jslib::compile_js(script);
        env::log_str(&(compiled.len().to_string()));
        let account_id = env::signer_account_id();
        self.scripts.insert(account_id.to_string(), compiled);
    }

    pub fn run_script_for_account(&self, account_id: String) -> String {
        let bytecode = self.scripts.get(&account_id).unwrap().to_vec();
        return jslib::run_js_bytecode(bytecode).to_string();    
    }
}
