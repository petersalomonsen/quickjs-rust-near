use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use spin_test_sdk::{
    bindings::{
        fermyon::{spin_test_virt, spin_wasi_virt::http_handler},
        wasi::{
            self,
            http::{self, types::OutgoingResponse},
        },
    },
    spin_test,
};

const SIGNING_PUBLIC_KEY: &str = "63LxSTBisoUfp3Gu7eGY8kAVcRAmZacZjceJ2jNeGZLH";

fn handle_openai_request() {
    let openai_response = http::types::OutgoingResponse::new(http::types::Headers::new());
    openai_response.write_body("data: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\",\"refusal\":null},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\n
data: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"!\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" How\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\n
data: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" can\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" I\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\n
data: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" assist\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" you\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\n
data: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" today\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"?\"},\"logprobs\":null,\"finish_reason\":null}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[{\"index\":0,\"delta\":{},\"logprobs\":null,\"finish_reason\":\"stop\"}],\"usage\":null}\n\ndata: {\"id\":\"chatcmpl-AMaFCyZmtLWFTUrXg0ZyEI9gz0wbj\",\"object\":\"chat.completion.chunk\",\"created\":1729945902,\"model\":\"gpt-4o-2024-08-06\",\"system_fingerprint\":\"fp_72bbfa6014\",\"choices\":[],\"usage\":{\"prompt_tokens\":18,\"completion_tokens\":9,\"total_tokens\":27,\"prompt_tokens_details\":{\"cached_tokens\":0},\"completion_tokens_details\":{\"reasoning_tokens\":0}}}\n\ndata: [DONE]\n\n
".as_bytes());

    http_handler::set_response(
        "https://api.openai.com/v1/chat/completions",
        http_handler::ResponseHandler::Response(openai_response),
    );
}

fn handle_openai_request_with_error() {
    let openai_response = http::types::OutgoingResponse::new(http::types::Headers::new());
    openai_response.set_status_code(401).unwrap();

    openai_response.write_body("{ \"statusCode\": 401, \"message\": \"Unauthorized. Access token is missing, invalid, audience is incorrect (https://cognitiveservices.azure.com), or have expired.\" }".as_bytes());

    http_handler::set_response(
        "https://api.openai.com/v1/chat/completions",
        http_handler::ResponseHandler::Response(openai_response),
    );
}

fn set_variables() {
    spin_test_virt::variables::set(
        "refund_signing_key",
        "5J4fAKqUQj1RT3JD2d58gWiXBNGavrZQPYbNMJwDjHnhF8J8KVC1UHxVu3f7Ng2tFkA9fXcECNW9xuf7iZpcYh1X",
    );
    spin_test_virt::variables::set("openai_api_key", "hello");
    spin_test_virt::variables::set(
        "openai_completions_endpoint",
        "https://api.openai.com/v1/chat/completions",
    );
    spin_test_virt::variables::set("ft_contract_id", "aitoken.testnet");
    spin_test_virt::variables::set("rpc_url", "https://rpc.mainnet.near.org");
}

#[spin_test]
fn test_hello_api() {
    // Perform the request
    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_path_with_query(Some("/")).unwrap();
    let response = spin_test_sdk::perform_request(request);

    // Assert response status and body is 404
    assert_eq!(response.status(), 200);
    assert!(response
        .body_as_string()
        .unwrap()
        .contains("Proxy OpenAI API"));
}

#[spin_test]
fn openai_request() {
    set_variables();

    handle_openai_request();
    let conversation_info = json!({"receiver_id":"aiuser.testnet","amount":"256000"})
        .to_string()
        .as_bytes()
        .to_vec();
    let response = http::types::OutgoingResponse::new(http::types::Headers::new());
    response.write_body(
        json!({
          "jsonrpc": "2.0",
          "result": {
            "result": conversation_info,
            "logs": [],
            "block_height": 17817336,
            "block_hash": "4qkA4sUUG8opjH5Q9bL5mWJTnfR4ech879Db1BZXbx6P"
          },
          "id": "dontcare"
        })
        .to_string()
        .as_bytes(),
    );
    http_handler::set_response(
        "https://rpc.mainnet.near.org",
        http_handler::ResponseHandler::Response(response),
    );

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request.set_path_with_query(Some("/proxy-openai")).unwrap();
    request.body().unwrap().write_bytes(json!(
        {
            "conversation_id": "aiuser.testnet_1729432017818",
            "messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"hello"}]
    }).to_string().as_bytes());
    let response = spin_test_sdk::perform_request(request);

    assert_eq!(response.status(), 200);
    assert!(response.body_as_string().unwrap().contains("[DONE]\n\n"));
    let store = spin_test_virt::key_value::Store::open("default");
    let stored_conversation_balance: serde_json::Value =
        serde_json::from_slice(&store.get("aiuser.testnet_1729432017818").unwrap()[..]).unwrap();

    assert_eq!(
        u64::from_str_radix(stored_conversation_balance["amount"].as_str().unwrap(), 10).unwrap(),
        (256000 - 27) as u64
    );
}

#[spin_test]
fn handle_openai_request_error() {
    set_variables();
    handle_openai_request_with_error();

    let conversation_info = json!({"receiver_id":"aiuser.testnet","amount":"256000"})
        .to_string()
        .as_bytes()
        .to_vec();
    let response = http::types::OutgoingResponse::new(http::types::Headers::new());
    response.write_body(
        json!({
          "jsonrpc": "2.0",
          "result": {
            "result": conversation_info,
            "logs": [],
            "block_height": 17817336,
            "block_hash": "4qkA4sUUG8opjH5Q9bL5mWJTnfR4ech879Db1BZXbx6P"
          },
          "id": "dontcare"
        })
        .to_string()
        .as_bytes(),
    );
    http_handler::set_response(
        "https://rpc.mainnet.near.org",
        http_handler::ResponseHandler::Response(response),
    );

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request.set_path_with_query(Some("/proxy-openai")).unwrap();
    request.body().unwrap().write_bytes(json!(
        {
            "conversation_id": "aiuser.testnet_1729432017818",
            "messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"hello"}]
    }).to_string().as_bytes());
    let response = spin_test_sdk::perform_request(request);

    assert_ne!(response.status(), 200);
    let store = spin_test_virt::key_value::Store::open("default");
    let stored_conversation_balance: serde_json::Value =
        serde_json::from_slice(&store.get("aiuser.testnet_1729432017818").unwrap()[..]).unwrap();

    assert_eq!(
        u64::from_str_radix(stored_conversation_balance["amount"].as_str().unwrap(), 10).unwrap(),
        (256000) as u64
    );
}

#[spin_test]
fn openai_request_unknown_conversation() {
    set_variables();

    handle_openai_request();

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request.set_path_with_query(Some("/proxy-openai")).unwrap();
    request.body().unwrap().write_bytes(json!(
        {
            "conversation_id": "aiuser.testnet_1729432017819",
            "messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"hello"}]
    }).to_string().as_bytes());
    let response = spin_test_sdk::perform_request(request);
    assert_eq!(response.status(), 500);
}

#[spin_test]
fn openai_request_insufficient_funds_deposited() {
    set_variables();

    handle_openai_request();
    let conversation_info = json!({"receiver_id":"aiuser.testnet","amount":"26"})
        .to_string()
        .as_bytes()
        .to_vec();
    let response = http::types::OutgoingResponse::new(http::types::Headers::new());
    response.write_body(
        json!({
          "jsonrpc": "2.0",
          "result": {
            "result": conversation_info,
            "logs": [],
            "block_height": 17817336,
            "block_hash": "4qkA4sUUG8opjH5Q9bL5mWJTnfR4ech879Db1BZXbx6P"
          },
          "id": "dontcare"
        })
        .to_string()
        .as_bytes(),
    );
    http_handler::set_response(
        "https://rpc.mainnet.near.org",
        http_handler::ResponseHandler::Response(response),
    );

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request.set_path_with_query(Some("/proxy-openai")).unwrap();
    request.body().unwrap().write_bytes(json!(
        {
            "conversation_id": "aiuser.testnet_1729432017820",
            "messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"hello"}]
    }).to_string().as_bytes());
    let response = spin_test_sdk::perform_request(request);

    assert_eq!(response.status(), 403);
    assert!(response
        .body_as_string()
        .unwrap()
        .contains("Insufficient tokens"));
    let store = spin_test_virt::key_value::Store::open("default");

    let stored_conversation_balance: serde_json::Value =
        serde_json::from_slice(&store.get("aiuser.testnet_1729432017820").unwrap()[..]).unwrap();
    assert_eq!(stored_conversation_balance["amount"], "26");
}

#[spin_test]
fn openai_request_insufficient_funds_ongoing_conversation() {
    set_variables();

    handle_openai_request();

    let store = spin_test_virt::key_value::Store::open("default");

    store.set(
        "aiuser.testnet_1729432017818",
        json!({
            "receiver_id": "aiuser.testnet",
            "amount": "128000"
        })
        .to_string()
        .as_bytes(),
    );

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request.set_path_with_query(Some("/proxy-openai")).unwrap();
    request.body().unwrap().write_bytes(json!(
        {
            "conversation_id": "aiuser.testnet_1729432017818",
            "messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"hello"}]
    }).to_string().as_bytes());
    let response = spin_test_sdk::perform_request(request);

    assert_eq!(response.status(), 403);
    assert!(response
        .body_as_string()
        .unwrap()
        .contains("Insufficient tokens"));

    let stored_conversation_balance: serde_json::Value =
        serde_json::from_slice(&store.get("aiuser.testnet_1729432017818").unwrap()[..]).unwrap();
    assert_eq!(stored_conversation_balance["amount"], "128000");
}

#[spin_test]
fn request_refund() {
    set_variables();

    let store = spin_test_virt::key_value::Store::open("default");

    store.set(
        "aiuser.testnet_1729432017818",
        json!({
            "receiver_id": "aiuser.testnet",
            "amount": "128000",
            "locked_for_ongoing_request": false
        })
        .to_string()
        .as_bytes(),
    );

    let request = http::types::OutgoingRequest::new(http::types::Headers::new());
    request.set_method(&http::types::Method::Post).unwrap();
    request
        .set_path_with_query(Some("/refund-conversation"))
        .unwrap();
    request.body().unwrap().write_bytes(
        json!(
            {
                "conversation_id": "aiuser.testnet_1729432017818"
        })
        .to_string()
        .as_bytes(),
    );
    let response = spin_test_sdk::perform_request(request);

    assert_eq!(response.status(), 200);
    let result: Value = serde_json::from_str(response.body_as_string().unwrap().as_str()).unwrap();
    let refund_message_str = result["refund_message"].as_str().unwrap();
    let refund_message: Value =
        serde_json::from_str(result["refund_message"].as_str().unwrap()).unwrap();
    assert_eq!(
        refund_message["receiver_id"].as_str().unwrap(),
        "aiuser.testnet"
    );
    assert_eq!(refund_message["refund_amount"].as_str().unwrap(), "128000");

    let public_key_bytes: [u8; 32] = bs58::decode(SIGNING_PUBLIC_KEY).into_vec().unwrap()[..32]
        .try_into()
        .unwrap();
    let public_key = VerifyingKey::from_bytes(&public_key_bytes).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(refund_message_str.as_bytes());
    let hashed_message = hasher.finalize();

    let signature_vec = result["signature"]
        .as_array()
        .expect("Expected 'signature' to be an array")
        .iter()
        .map(|v| v.as_u64().expect("Expected each item to be a number") as u8)
        .collect::<Vec<u8>>();

    let mut signature: [u8; 64] = [0u8; 64];
    signature.copy_from_slice(&signature_vec[..64]);
    assert!(public_key
        .verify_strict(&hashed_message, &Signature::from_bytes(&signature))
        .is_ok());
}
