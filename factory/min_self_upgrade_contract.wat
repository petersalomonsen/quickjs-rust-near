(module
  (import "env" "current_account_id" (func $current_account_id (param i64)))
  (import "env" "input" (func $input (param i64)))
  (import "env" "read_register" (func $read_register (param i64 i64)))
  (import "env" "register_len" (func $register_len (param i64) (result i64)))
  (import "env" "promise_batch_create" (func $promise_batch_create (param i64 i64) (result i64)))
  (import "env" "promise_batch_action_deploy_contract" (func $promise_batch_action_deploy_contract (param i64 i64 i64)))

  (func (export "upgrade")
    (local $promise_id i64)
 
    ;; Read current account id into addr 1024
    (call $current_account_id (i64.const 0))
    (call $read_register (i64.const 0) (i64.const 1024))

    ;; Create a batch promise for deploying to self
    (call $promise_batch_create (call $register_len (i64.const 0)) (i64.const 1024))
    (local.set $promise_id)

    ;; Read contract binary data from input into addr 2048
    (call $input (i64.const 0))
    (call $read_register (i64.const 0) (i64.const 2048))

    ;; Deploy contract using the input binary data
    (call $promise_batch_action_deploy_contract
      (local.get $promise_id)
      (call $register_len (i64.const 0))
      (i64.const 2048) 
    )
  )
  (memory 32)
)
