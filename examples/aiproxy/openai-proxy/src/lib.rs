use base64::prelude::*;
use ed25519_dalek::{ed25519::signature::SignerMut, SigningKey};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use sha2::{Digest, Sha256};
use spin_sdk::{
    http::{self, Headers, IncomingResponse, Method, OutgoingResponse, Request, ResponseOutparam},
    http_component,
    key_value::Store,
    variables,
};

const MIN_TOKENS: u64 = 128_000 + 16384;

#[derive(Deserialize, Serialize)]
struct ConversationBalance {
    receiver_id: String,
    #[serde(deserialize_with = "string_to_u64", serialize_with = "u64_to_string")]
    amount: u64,
}

impl Default for ConversationBalance {
    fn default() -> Self {
        Self {
            receiver_id: Default::default(),
            amount: 0,
        }
    }
}

#[derive(Serialize)]
struct RefundMessage {
    conversation_id: String,
    receiver_id: String,
    #[serde(serialize_with = "u64_to_string")]
    refund_amount: u64,
}

#[derive(Serialize)]
struct RefundRequest {
    refund_message: String,
    #[serde(serialize_with = "serialize_signature")]
    signature: [u8; 64],
}

// Custom serialization function for [u8; 64]
fn serialize_signature<S>(signature: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_bytes(signature)
}

// Custom serialization function for "amount" field
fn u64_to_string<S>(amount: &u64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&amount.to_string())
}

fn conversation_id_to_hash_string(conversation_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(conversation_id.as_bytes());
    hex::encode(hasher.finalize())
}

fn string_to_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    u64::from_str_radix(&s, 10).map_err(serde::de::Error::custom)
}

fn get_signing_key(b58_key: &str) -> SigningKey {
    // Decode the base58 string to bytes
    let key_bytes: [u8; 32] = bs58::decode(b58_key).into_vec().unwrap()[..32]
        .try_into()
        .unwrap();

    // Create the SigningKey from bytes
    SigningKey::from_bytes(&key_bytes)
}

fn cors_headers_entries() -> Vec<(String, Vec<u8>)> {
    vec![
        (
            "Access-Control-Allow-Origin".to_string(),
            "*".to_string().into_bytes(),
        ),
        (
            "Access-Control-Allow-Methods".to_string(),
            "POST, GET, OPTIONS".to_string().into_bytes(),
        ),
        (
            "Access-Control-Allow-Headers".to_string(),
            "Content-Type, Authorization".to_string().into_bytes(),
        ),
    ]
}
fn cors_headers() -> Headers {
    Headers::from_list(&cors_headers_entries()).unwrap()
}

#[http_component]
async fn handle_request(request: Request, response_out: ResponseOutparam) {
    match (request.method(), request.path_and_query().as_deref()) {
        (Method::Options, Some("/refund-conversation")) => {
            let mut headers_entries = cors_headers_entries().clone();
            headers_entries.push((
                String::from("content-type"),
                "application/json; charset=utf-8".as_bytes().to_vec(),
            ));

            let headers = Headers::from_list(&headers_entries).unwrap();
            let response = OutgoingResponse::new(headers);
            response.set_status_code(200).unwrap();
            response_out.set(response);
        }
        (Method::Post, Some("/refund-conversation")) => {
            let incoming_request_body: Value =
                serde_json::from_slice(&request.into_body()[..]).unwrap();
            let conversation_id = incoming_request_body["conversation_id"].as_str().unwrap();
            let conversation_balance_store = Store::open_default().unwrap();
            let conversation_balance: ConversationBalance =
                match conversation_balance_store.get_json(conversation_id) {
                    Ok(None) => {
                        return forbidden(response_out, "Conversation does not exist").await;
                    }
                    Ok(Some(stored_conversation_balance)) => stored_conversation_balance,
                    Err(_) => {
                        eprintln!("Unable to get conversation balance");
                        return server_error(response_out);
                    }
                };

            let refund_message = RefundMessage {
                conversation_id: conversation_id_to_hash_string(conversation_id),
                receiver_id: conversation_balance.receiver_id.clone(),
                refund_amount: conversation_balance.amount,
            };
            let response = OutgoingResponse::new(cors_headers());
            response.set_status_code(200).unwrap();

            let refund_message_str = serde_json::to_string(&refund_message).unwrap();
            let bytes = refund_message_str.clone().into_bytes();
            let mut hasher = Sha256::new();
            hasher.update(bytes);
            let hashed_message = hasher.finalize();

            let mut signing_key =
                get_signing_key(variables::get("refund_signing_key").unwrap().as_str());
            let signature = signing_key.sign(&hashed_message);

            let refund_request = RefundRequest {
                refund_message: refund_message_str,
                signature: signature.to_bytes(),
            };
            response_out
                .set_with_body(response, serde_json::to_vec(&refund_request).unwrap())
                .await
                .unwrap();

            conversation_balance_store
                .set_json(conversation_id, &conversation_balance)
                .unwrap();
        }
        (Method::Options, Some("/proxy-openai")) => {
            let response = OutgoingResponse::new(cors_headers());
            response.set_status_code(200).unwrap();
            response_out.set(response);
        }
        (Method::Post, Some("/proxy-openai")) => {
            let incoming_request_body: Value =
                serde_json::from_slice(&request.into_body()[..]).unwrap();
            let conversation_id = incoming_request_body["conversation_id"].as_str().unwrap();
            let messages = incoming_request_body["messages"].clone();
            let tools = incoming_request_body["tools"].clone();

            let conversation_balance_store = Store::open_default().unwrap();
            let mut conversation_balance: ConversationBalance =
                match conversation_balance_store.get_json(conversation_id) {
                    Ok(None) => {
                        conversation_balance_store
                            .set_json(conversation_id, &ConversationBalance::default())
                            .unwrap();
                        match get_initial_token_balance_for_conversation(conversation_id).await {
                            Ok(result) => result,
                            Err(err) => {
                                eprintln!("Unable to get initial conversation balance: {:?}", err);
                                return server_error(response_out);
                            }
                        }
                    }
                    Ok(Some(stored_conversation_balance)) => stored_conversation_balance,
                    Err(_) => {
                        eprintln!("Unable to get conversation balance");
                        return server_error(response_out);
                    }
                };

            conversation_balance_store
                .set_json(conversation_id, &conversation_balance)
                .unwrap();

            if conversation_balance.amount < MIN_TOKENS {
                return forbidden(
                    response_out,
                    format!(
                        "Insufficient tokens ( {} / {}), get a refund and start a new conversation",
                        conversation_balance.amount, MIN_TOKENS
                    )
                    .as_str(),
                )
                .await;
            }

            match proxy_openai(messages, tools).await {
                Ok(incoming_response) => {
                    if incoming_response.status() != 200 {
                        conversation_balance_store
                            .set_json(conversation_id, &conversation_balance)
                            .unwrap();
                        let response_data = incoming_response.into_body().await.unwrap();
                        let response_string = String::from_utf8(response_data).unwrap();
                        eprintln!(
                            "error in response from OpenAI endpoint: {:?}",
                            response_string
                        );
                        return server_error(response_out);
                    }
                    let mut incoming_response_body = incoming_response.take_body_stream();
                    let mut headers_entries = cors_headers_entries().clone();
                    headers_entries.push((
                        String::from("content-type"),
                        "text/event-stream; charset=utf-8".as_bytes().to_vec(),
                    ));

                    let headers = Headers::from_list(&headers_entries).unwrap();
                    let outgoing_response = OutgoingResponse::new(headers);
                    let mut outgoing_response_body = outgoing_response.take_body();

                    response_out.set(outgoing_response);

                    let mut complete_response = String::new();
                    let mut completion_id = String::new();
                    let mut usage_info: Option<Value> = None;

                    // Stream the OpenAI response chunks back to the client
                    while let Some(chunk) = incoming_response_body.next().await {
                        match chunk {
                            Ok(data) => {
                                // Clone the chunk for further processing to avoid move errors
                                let data_clone = data.clone();

                                // Convert the chunk to a string
                                if let Ok(chunk_str) = String::from_utf8(data_clone) {
                                    // Split the chunk string by lines
                                    for line in chunk_str.lines() {
                                        if line.starts_with("data: ") {
                                            let json_str = &line[6..];
                                            if json_str.trim() == "[DONE]" {
                                                break;
                                            }
                                            complete_response.push_str(json_str);
                                            complete_response.push('\n');

                                            // Extract completion ID from the first chunk containing metadata
                                            if completion_id.is_empty() {
                                                if let Ok(json_value) =
                                                    serde_json::from_str::<Value>(json_str)
                                                {
                                                    if let Some(id) =
                                                        json_value.get("id").and_then(Value::as_str)
                                                    {
                                                        completion_id = id.to_string();
                                                    }
                                                }
                                            }

                                            // Extract usage information if present
                                            if let Ok(json_value) =
                                                serde_json::from_str::<Value>(json_str)
                                            {
                                                let usage_info_in_json = json_value.get("usage");
                                                if usage_info_in_json.is_some() {
                                                    usage_info = json_value.get("usage").cloned();
                                                }
                                            }
                                        }
                                    }
                                }

                                // Stream the response chunk back to the client
                                if let Err(e) = outgoing_response_body.send(data).await {
                                    eprintln!("Error sending response chunk: {e}");
                                    return;
                                }
                            }
                            Err(e) => {
                                eprintln!("Error reading response chunk: {e}");
                                return;
                            }
                        }
                    }

                    // Log usage information if available
                    if let Some(usage) = usage_info {
                        if let Some(total_tokens) = usage.get("total_tokens") {
                            let total_tokens = total_tokens.as_u64().unwrap_or(0);
                            let model = usage
                                .get("model")
                                .and_then(Value::as_str)
                                .unwrap_or("gpt-4-o");

                            // Calculate the cost based on the model used
                            let cost_per_1k_tokens = match model {
                                "gpt-4" => 0.03,
                                _ => 0.002,
                            };
                            let cost = (total_tokens as f64 / 1000.0) * cost_per_1k_tokens;

                            conversation_balance.amount -= total_tokens;

                            conversation_balance_store
                                .set_json(conversation_id, &conversation_balance)
                                .unwrap();
                            // Log the token usage and cost
                            eprintln!("Total tokens used: {}", total_tokens);
                            eprintln!("Model: {}", model);
                            eprintln!("Cost for this request: ${:.4}", cost);
                        }
                    }
                }
                Err(_e) => {
                    server_error(response_out);
                }
            }
        }
        (Method::Get, _) => {
            let response = OutgoingResponse::new(Headers::new());
            response.set_status_code(200).unwrap();

            let body_content = b"<html><body><h1>Proxy OpenAI API</h1></body></html>";
            let mut body = response.take_body();
            if let Err(e) = body.send(body_content.to_vec()).await {
                eprintln!("Error writing body content: {e}");
                server_error(response_out);
                return;
            }

            response_out.set(response);
        }
        _ => {
            eprintln!("Method not allowed");
            method_not_allowed(response_out);
        }
    }
}

async fn get_initial_token_balance_for_conversation(
    conversation_id: &str,
) -> anyhow::Result<ConversationBalance> {
    let ft_contract_id = variables::get("ft_contract_id")?;
    let rpc_url = variables::get("rpc_url")?;

    let rpc_args = serde_json::json!({
        "function_name": "view_ai_conversation",
        "conversation_id": conversation_id_to_hash_string(conversation_id)
    });
    let request = Request::post(
        rpc_url,
        serde_json::json!({
          "jsonrpc": "2.0",
          "id": "dontcare",
          "method": "query",
          "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": ft_contract_id,
            "method_name": "view_js_func",
            "args_base64": BASE64_STANDARD.encode(rpc_args.to_string())
          }
        })
        .to_string(),
    )
    .header("content-type", "application/json")
    .build();

    match http::send::<_, IncomingResponse>(request).await {
        Ok(resp) => {
            let response_body = resp.into_body().await.unwrap();
            let json_response_result: Result<Value, serde_json::Error> =
                serde_json::from_slice(&response_body[..]);
            match json_response_result {
                Ok(json_response) => {
                    if let Some(result_bytes) = json_response["result"]["result"].as_array() {
                        let result_bytes_vec: Vec<u8> = result_bytes
                            .iter()
                            .map(|v| v.as_u64().unwrap() as u8)
                            .collect();
                        let result: Result<ConversationBalance, serde_json::Error> =
                            serde_json::from_slice(result_bytes_vec.as_slice());
                        match result {
                            Ok(result) => Ok(result),
                            Err(e) => {
                                eprintln!(
                                    "Error getting initial balance for conversation: {:?} {:?}",
                                    e,
                                    json_response.to_string()
                                );
                                return Err(anyhow::anyhow!(
                                    "Error getting initial balance for conversation: {e}"
                                ));
                            }
                        }
                    } else {
                        let error_message =
                            format!("no result value {}", json_response.to_string());
                        eprintln!("{}", error_message);
                        return Err(anyhow::anyhow!(error_message));
                    }
                }
                Err(e) => {
                    eprintln!(
                        "Invalid response from RPC: {:?}",
                        String::from_utf8(response_body)
                    );
                    return Err(anyhow::anyhow!("Invalid response from RPC: {e}"));
                }
            }
        }
        Err(e) => {
            eprintln!("Error getting initial balance for conversation: {e}");
            return Err(anyhow::anyhow!(
                "Error getting initial balance for conversation: {e}"
            ));
        }
    }
}

// Function to handle the actual proxy logic
async fn proxy_openai(messages: Value, tools: Value) -> anyhow::Result<IncomingResponse> {
    let request_body = serde_json::json!({
        "model": "gpt-4o",
        "messages": messages,
        "tools": tools,
        "stream": true,
        "stream_options": {
            "include_usage": true
        }
    });

    let openai_completions_endpoint = variables::get("openai_completions_endpoint")?;
    let api_key = variables::get("openai_api_key").unwrap();
    let api_key_method =
        variables::get("openai_api_key_method").unwrap_or_else(|_| "authorization".to_string());

    let mut openai_request_builder = Request::builder();
    openai_request_builder
        .method(Method::Post)
        .uri(openai_completions_endpoint)
        .header("Content-Type", "application/json");

    let openai_request = match api_key_method.as_str() {
        "api-key" => openai_request_builder.header("Api-Key", api_key),
        _ => openai_request_builder.header("Authorization", format!("Bearer {}", api_key)),
    }
    .body(request_body.to_string())
    .build();

    let response = match http::send::<_, IncomingResponse>(openai_request).await {
        Ok(resp) => resp,
        Err(e) => {
            eprintln!("Error sending request to OpenAI: {e}");
            return Err(anyhow::anyhow!("Error sending request to OpenAI: {e}"));
        }
    };

    Ok(response)
}

// Helper functions for error responses
fn server_error(response_out: ResponseOutparam) {
    eprintln!("Internal server error");
    respond(500, response_out)
}

fn method_not_allowed(response_out: ResponseOutparam) {
    eprintln!("Method not allowed");
    respond(405, response_out)
}

async fn forbidden(response_out: ResponseOutparam, reason: &str) {
    eprintln!("Forbidden: {}", reason);
    let response = OutgoingResponse::new(cors_headers());
    response.set_status_code(403).unwrap();
    if let Err(e) = response.take_body().send(reason.as_bytes().to_vec()).await {
        eprintln!("Error writing body content: {e}");
        server_error(response_out);
        return;
    }
    response_out.set(response);
}

fn respond(status: u16, response_out: ResponseOutparam) {
    let response = OutgoingResponse::new(cors_headers());
    response.set_status_code(status).unwrap();

    response_out.set(response);
}
