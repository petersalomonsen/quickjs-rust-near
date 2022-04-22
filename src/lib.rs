use std::collections::HashMap;
use near_sdk::{env,near_bindgen,AccountId};
use near_sdk::borsh::{self, BorshDeserialize,BorshSerialize};
mod jslib;

#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Scripts {
    scripts: HashMap<AccountId, String>
}

#[near_bindgen]
impl Scripts {
    /*pub fn upload_script(&mut self, script: String) {
        let account_id = env::signer_account_id();
        self.scripts.insert(account_id, script);
    }

    pub fn run_script_for_account(&self, account_id: AccountId) -> String {
        let context = Context::default();
        let val = context.eval_global(&account_id, &self.scripts.get(&account_id).unwrap()).unwrap();
        let script = val.as_str().unwrap().to_string();

        return jslib::run_js(script).to_string();
    }*/

    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }

    
    /*pub fn direct_script(&self) {
        println!("hello {}",jslib::run_js("(function() {return 'tester'.length+8+16})();".to_string()));

    }*/
}
