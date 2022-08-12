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
    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }
}
