use near_sdk::{near_bindgen};
use near_sdk::borsh::{self, BorshDeserialize,BorshSerialize};
mod jslib;

#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Scripts {

}

#[near_bindgen]
impl Scripts {
    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }
}
