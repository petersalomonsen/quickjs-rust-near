use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env, near_bindgen};
use std::collections::HashMap;
mod jslib;
mod wasimock;
#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Scripts {
    scripts: HashMap<String, Vec<u8>>,
}

#[near_bindgen]
impl Scripts {
    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }

    pub fn run_bytecode(&self, bytecodebase64: String) -> String {
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Write};
    mod nearmock;

    use std::sync::Once;

    static INIT: Once = Once::new();

    pub fn setup() {
        INIT.call_once(|| {
            std::panic::set_hook(Box::new(|panic_info| {
                let _ = writeln!(io::stderr(), "{}", panic_info);
            }));
        });
    }

    #[test]
    fn test_run_script() {
        setup();
        let contract = Scripts::default();

        let result = contract.run_script("print('hello');(1+2+3);".to_string());
        assert_eq!("6".to_string(), result);
    }

    #[test]
    fn test_submit_and_run_stored_script() {
        setup();
        let mut contract = Scripts::default();

        contract.submit_script("(function () { return 15+4+3; })()".to_string());
        let result = contract.run_script_for_account("test.near".to_string());
        assert_eq!("22".to_string(), result);
    }
}
