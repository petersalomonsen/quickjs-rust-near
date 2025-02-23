use std::fs;

use cargo_near_build::BuildOpts;
use near_sdk::base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::json;
use near_sdk::NearToken;
use near_workspaces::types::{AccessKeyPermission, SecretKey};
use near_workspaces::Account;

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Web4Response {
    #[serde(rename = "contentType")]
    content_type: String,
    body: String,
}

#[tokio::test]
async fn test_factory() -> Result<(), Box<dyn std::error::Error>> {
    let mainnet = near_workspaces::mainnet().await?;

    let worker = near_workspaces::sandbox().await?;

    let build_opts = BuildOpts::builder().build();
    let build_artifact = cargo_near_build::build(build_opts).expect("Failed to build contract");

    let near_contract = worker
        .import_contract(&"near".parse().unwrap(), &mainnet)
        .initial_balance(NearToken::from_near(100_000_000))
        .transact()
        .await?;

    let factory_contract = worker
        .import_contract(&"web4factory.near".parse().unwrap(), &mainnet)
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await?;

    let wasm = fs::read(build_artifact.path).expect("Unable to read contract wasm");
    factory_contract
        .as_account()
        .deploy(&wasm)
        .await?
        .into_result()?;

    let init_near_result = near_contract.call("new").max_gas().transact().await?;
    if init_near_result.is_failure() {
        panic!(
            "Error initializing NEAR\n{:?}",
            String::from_utf8(init_near_result.raw_bytes().unwrap())
        );
    }

    let user_account = worker.dev_create_account().await?;

    let factory_account_details_before = factory_contract.view_account().await?;
    let user_account_details_before = user_account.view_account().await?;

    let instance_account_id = "myweb4.near";
    let create_instance_result = user_account
        .call(factory_contract.id(), "create")
        .args_json(json!(
            {
                "new_account_id": instance_account_id
            }
        ))
        .max_gas()
        .deposit(NearToken::from_near(9))
        .transact()
        .await?;

    let instance_account = Account::from_secret_key(
        instance_account_id.parse().unwrap(),
        user_account.secret_key().to_owned(),
        &worker,
    );

    println!("logs: {:?}", create_instance_result.logs());
    let user_account_details_after = user_account.view_account().await?;
    let factory_account_details_after = factory_contract.view_account().await?;

    assert_eq!(
        create_instance_result.receipt_failures().len(),
        0,
        "Total tgas burnt {:?}, Receipt failures: {:?}",
        create_instance_result.total_gas_burnt.as_tgas(),
        create_instance_result.receipt_failures()
    );

    assert!(create_instance_result.is_success());

    assert!(
        user_account_details_after.balance
            < (user_account_details_before
                .balance
                .saturating_sub(NearToken::from_near(9))),
        "User balance after ( {} mNEAR) should be at least 9 NEAR less than before creating instance ( {} mNEAR ). {:?}", user_account_details_after.balance.as_millinear(), user_account_details_before.balance.as_millinear(),
        create_instance_result.logs()
    );

    assert!(
        factory_account_details_after.balance.as_millinear()
            - factory_account_details_before.balance.as_millinear()
            < 10,
        "factory balance after ({}) should be equal or slightly above balance before ({}). {:?}",
        factory_account_details_after.balance.as_millinear(),
        factory_account_details_before.balance.as_millinear(),
        create_instance_result.logs()
    );

    assert!(factory_account_details_after.balance > factory_account_details_before.balance);

    println!(
        "Total tgas burnt {:?}",
        create_instance_result.total_gas_burnt.as_tgas()
    );

    let post_javascript_result = instance_account
        .call(&instance_account_id.parse().unwrap(), "post_javascript")
        .args_json(json!({
            "javascript": "
export function web4_get() {
    env.value_return(
        JSON.stringify(
        {
            contentType: \"text/html; charset=UTF-8\",
            body: env.base64_encode(\"hello\")
        }
        )
    );
}
"
        }))
        .transact()
        .await?;

    assert!(
        post_javascript_result.is_success(),
        "Error posting javascript: {:?}",
        post_javascript_result.receipt_failures()
    );

    let result = user_account
        .view(&instance_account_id.parse().unwrap(), "web4_get")
        .args_json(json!({"request": {"path": "/"}}))
        .await?;

    let response = result.json::<Web4Response>().unwrap();
    assert_eq!("text/html; charset=UTF-8", response.content_type);

    let user_full_access_public_key = user_account.secret_key().public_key();
    let user_access_key = worker
        .view_access_key(
            &instance_account_id.parse().unwrap(),
            &user_full_access_public_key,
        )
        .await?;
    assert!(
        matches!(user_access_key.permission, AccessKeyPermission::FullAccess),
        "Expected FullAccess permission"
    );
    Ok(())
}
