#[cfg(not(feature = "library"))]
use web4::types::{Web4Request, Web4Response};
#[cfg(not(feature = "library"))]
use web4::webappbundle::WEB_APP_BUNDLE;
#[cfg(not(feature = "library"))]
use viewaccesscontrol::{store_signing_key_for_account};
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{base64, env, near_bindgen};
use std::collections::HashMap;
pub mod jslib;
pub mod web4;
pub mod viewaccesscontrol;
    
mod wasimock;
#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct Scripts {
    scripts: HashMap<String, Vec<u8>>,
}

#[near_bindgen]
impl Scripts {
    #[cfg(not(feature = "library"))]
    pub fn store_signing_key() {
        store_signing_key_for_account(env::block_timestamp_ms() + 24 * 60 * 60 * 1000);
    }

    pub fn run_script(&self, script: String) -> String {
        return jslib::run_js(script).to_string();
    }

    pub fn run_bytecode(&self, bytecodebase64: String) -> String {
        let bytecode: Result<Vec<u8>, base64::DecodeError> = base64::decode(&bytecodebase64);
        return jslib::run_js_bytecode(bytecode.unwrap()).to_string();
    }

    pub fn submit_script(&mut self, script: String) {
        let compiled = jslib::compile_js(script, None);
        env::log_str(&(compiled.len().to_string()));
        let account_id = env::signer_account_id();
        self.scripts.insert(account_id.to_string(), compiled);
    }

    pub fn run_script_for_account(&self, account_id: String) -> String {
        let bytecode = self.scripts.get(&account_id).unwrap().to_vec();
        return jslib::run_js_bytecode(bytecode).to_string();
    }

    pub fn run_script_for_account_no_return(&self, account_id: String) {
        let bytecode = self.scripts.get(&account_id).unwrap().to_vec();
        jslib::run_js_bytecode(bytecode);
    }

    #[cfg(not(feature = "library"))]
    pub fn web4_get(&self, #[allow(unused_variables)] request: Web4Request) -> Web4Response {
        Web4Response::Body {
            content_type: "text/html; charset=UTF-8".to_owned(),
            body: WEB_APP_BUNDLE.to_owned(),
        }
    }
}


#[cfg(test)]
pub mod tests {
    use super::*;

    use quickjs_rust_near_testenv::testenv::{alice, set_signer_account_id, setup_test_env, assert_latest_return_value_string_eq};
    use quickjs_rust_near_testenv::musicscript::MUSIC_SCRIPT;

    #[test]
    fn test_run_script() {
        setup_test_env();
        let contract = Scripts::default();

        let result = contract.run_script("print('hello');(1+2+3);".to_string());
        assert_eq!("6".to_string(), result);
    }

    #[test]
    fn test_submit_and_run_stored_script() {
        setup_test_env();
        set_signer_account_id(alice());
        let mut contract = Scripts::default();

        contract.submit_script("(function () { return 15+4+3; })()".to_string());
        let result = contract.run_script_for_account(alice().to_string());
        assert_eq!("22".to_string(), result);
    }

    #[test]
    fn test_run_bytecode() {
        setup_test_env();

        let contract = Scripts::default();

        let result = contract.run_bytecode("AgQKcGFyc2UUeyJhIjogMjIyfQJhGDxldmFsc291cmNlPg4ABgCgAQABAAMAABsBogEAAAA4mwAAAELeAAAABN8AAAAkAQBB4AAAALidzSjCAwEA".to_string());
        assert_eq!("225".to_string(), result);
    }

    #[test]
    fn test_run_async() {
        setup_test_env();

        set_signer_account_id(alice());
        let mut contract = Scripts::default();

        contract.submit_script("(async () => {
            print('before await');
            await new Promise(r => r());
            print('between promises');
            await new Promise(r => r());
            print('after await');
            env.value_return('return after async');
        })()".to_string());

        contract.run_script_for_account(alice().to_string());
        assert_latest_return_value_string_eq(
            "return after async".to_string()
        );
    }

    #[test]
    fn test_value_return_from_js() {
        setup_test_env();
        let contract = Scripts::default();
        contract.run_script("env.value_return('test value return')".to_string());
        assert_latest_return_value_string_eq(
            "test value return".to_string()
        );
    }

    #[test]
    fn test_run_async_music_script() {
        setup_test_env();

        set_signer_account_id(alice());
        let mut contract = Scripts::default();

        contract.submit_script(MUSIC_SCRIPT.to_string());

        contract.run_script_for_account_no_return(alice().to_string());
        assert_latest_return_value_string_eq(
            "[{\"time\":0,\"message\":[148,26,100]},{\"time\":0,\"message\":[146,60,100]},{\"time\":166,\"message\":[146,66,10]},{\"time\":233,\"message\":[130,66,0]},{\"time\":267,\"message\":[132,26,0]},{\"time\":333,\"message\":[146,66,80]},{\"time\":500,\"message\":[148,26,100]},{\"time\":533,\"message\":[130,66,0]},{\"time\":567,\"message\":[132,26,0]},{\"time\":666,\"message\":[148,33,100]},{\"time\":666,\"message\":[146,62,100]},{\"time\":667,\"message\":[130,60,0]},{\"time\":799,\"message\":[132,33,0]},{\"time\":833,\"message\":[148,36,100]},{\"time\":966,\"message\":[132,36,0]},{\"time\":1000,\"message\":[146,66,70]},{\"time\":1166,\"message\":[148,38,100]},{\"time\":1166,\"message\":[146,60,100]},{\"time\":1200,\"message\":[130,66,0]},{\"time\":1299,\"message\":[132,38,0]},{\"time\":1333,\"message\":[130,62,0]},{\"time\":1500,\"message\":[148,36,100]},{\"time\":1500,\"message\":[146,66,10]},{\"time\":1567,\"message\":[130,66,0]},{\"time\":1666,\"message\":[146,66,80]},{\"time\":1666,\"message\":[146,60,100]},{\"time\":1700,\"message\":[132,36,0]},{\"time\":1833,\"message\":[148,33,100]},{\"time\":1833,\"message\":[130,60,0]},{\"time\":1866,\"message\":[130,66,0]},{\"time\":1966,\"message\":[132,33,0]},{\"time\":2000,\"message\":[146,62,100]},{\"time\":2166,\"message\":[148,33,100]},{\"time\":2299,\"message\":[132,33,0]},{\"time\":2333,\"message\":[148,36,100]},{\"time\":2333,\"message\":[146,66,70]},{\"time\":2333,\"message\":[130,60,0]},{\"time\":2400,\"message\":[132,36,0]},{\"time\":2500,\"message\":[148,38,100]},{\"time\":2500,\"message\":[146,62,20]},{\"time\":2533,\"message\":[130,66,0]},{\"time\":2567,\"message\":[130,62,0]},{\"time\":2633,\"message\":[132,38,0]},{\"time\":2666,\"message\":[-1]}]".to_string()
        );
    }
}
