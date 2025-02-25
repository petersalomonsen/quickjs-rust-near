export let storage = {};
export let registers = {};

export let memory;
export let latest_return_value;
export let _args = '{}';
export let _current_account_id = 'test';
export let _signer_account_id = 'test';
export let _predecessor_account_id = 'test';
export let _attached_deposit = 0n;
export let _input = {};
export let _logs = [];

export function reset_near_env() {
    storage = {};
    registers = {};
    _args = '{}';
    _logs = [];
}

export function set_args(args) {
    _args = JSON.stringify(args);
}

export function set_wasm_memory(wasm_memory) {
    memory = wasm_memory;
}

export function set_register_string_value(key, str) {
    registers[key] = new TextEncoder().encode(str);
}

export function set_attached_deposit(deposit) {
    _attached_deposit = deposit;
}

export function set_signer_account_id(account_id) {
    _signer_account_id = account_id;
}

export function set_predecessor_account_id(account_id) {
    _predecessor_account_id = account_id;
}

export function attached_deposit(balance_ptr) {
    new DataView(memory.buffer).setBigUint64(Number(balance_ptr), _attached_deposit, true);
    new DataView(memory.buffer).setBigUint64(Number(balance_ptr + 8n), _attached_deposit >> 64n, true);
}

export function current_account_id(register) {
    set_register_string_value(register, _current_account_id);
}

export function input(register_id) {
    registers[register_id] = new TextEncoder().encode(_args);
}

export function storage_usage() {
    let usage = 0;
    Object.keys(storage).forEach(k => {
        usage += (k.length + 1);
        usage += (storage[k].length + 1);
    });
    return BigInt(usage);
}

/// Writes key-value into storage.
/// * If key is not in use it inserts the key-value pair and does not modify the register. Returns `0`;
/// * If key is in use it inserts the key-value and copies the old value into the `register_id`. Returns `1`.
///
/// # Errors
///
/// * If `key_len + key_ptr` or `value_len + value_ptr` exceeds the memory container or points
///   to an unused register it returns `MemoryAccessViolation`;
/// * If returning the preempted value into the registers exceed the memory container it returns
///   `MemoryAccessViolation`.
/// * If the length of the key exceeds `max_length_storage_key` returns `KeyLengthExceeded`.
/// * If the length of the value exceeds `max_length_storage_value` returns
///   `ValueLengthExceeded`.
/// * If called as view function returns `ProhibitedInView``.
///
export function storage_write(key_len, key_ptr, value_len, value_ptr, register_id) {
    const key = new TextDecoder().decode(memory.buffer.slice(Number(key_ptr), Number(key_ptr + key_len)));
    const val = new Uint8Array(memory.buffer.slice(Number(value_ptr), Number(value_ptr + value_len)));

    // console.log('storage_write', register_id, key, new TextDecoder().decode(val), value_len);
    let alreadyExisted = 0n;
    if (storage[key] != undefined) {
        registers[register_id] = storage[key];
        alreadyExisted = 1n;
    }
    storage[key] = val;
    return alreadyExisted;
}

export function storage_remove(key_len,
    key_ptr,
    register_id) {
    const key = new TextDecoder().decode(memory.buffer.slice(Number(key_ptr), Number(key_ptr + key_len)));
    if (storage[key] != undefined) {
        registers[register_id] = storage[key];
        delete storage[key];
        return 1n;
    } else {
        return 0n;
    }
}

export function account_balance() {
    return 0n;
}
export function account_locked_balance() {
    return 0n;
}
export function value_return(value_len, value_ptr) {
    latest_return_value = new TextDecoder().decode(memory.buffer.slice(Number(value_ptr), Number(value_ptr + value_len)));
}

export function promise_batch_action_create_account() { }
export function promise_batch_action_deploy_contract() { }
export function promise_batch_action_function_call() { }
export function promise_batch_action_transfer() { }
export function promise_batch_action_stake() { }
export function promise_batch_action_add_key_with_full_access() { }
export function promise_batch_action_add_key_with_function_call() { }
export function promise_batch_action_delete_key() { }
export function promise_batch_action_delete_account() { }
export function promise_batch_action_function_call_weight() { }
export function read_register(register, ptr) {

    const reg_value = registers[register];
    if (reg_value != undefined && reg_value.length > 0) {
        new Uint8Array(memory.buffer).set(reg_value, Number(ptr));
    }
    // console.log('read_register', reg_value, new TextDecoder().decode(new Uint8Array(memory.buffer).slice(Number(ptr),Number(ptr)+reg_value.length)));
}
export function register_len(register_id) {
    const registercontent = registers[register_id];
    return BigInt(registercontent != undefined ? registercontent.length : BigInt('0xffffffffffffffff'));
}

export function write_register() { }
export function signer_account_id(register) {
    set_register_string_value(register, _signer_account_id);
}
export function signer_account_pk() { }
export function predecessor_account_id(register) {
    set_register_string_value(register, _predecessor_account_id);
}
export function block_index() { }
export function block_timestamp() { return BigInt(new Date().getTime() * 1_000_000) }
export function epoch_height() { }

export function prepaid_gas() { }
export function used_gas() { }
export function random_seed() { }
export function sha256() { }
export function keccak256() { }
export function keccak512() { }
export function ripemd160() { }
export function ecrecover() { }
export function panic() { }
export function panic_utf8(len, ptr) {
    const msg = new TextDecoder().decode(memory.buffer.slice(Number(ptr), Number(ptr + len)));
    console.error('panic', msg);
    throw msg;
}
export function log(msg) { print(msg) }
export function log_utf8(len, ptr) {
    const msg = new TextDecoder().decode(memory.buffer.slice(Number(ptr), Number(ptr + len)));
    console.log('log', msg);
    _logs.push(msg);
}
export function log_utf16() { }
export function promise_create() { }
export function promise_then() { }
export function promise_and() { }
export function promise_batch_create() { }
export function promise_batch_then() { }
export function promise_results_count() { }
export function promise_result() { }
export function promise_return() { }

export function storage_read(key_len, key_ptr, register_id) {
    const key = new TextDecoder().decode(memory.buffer.slice(Number(key_ptr), Number(key_ptr + key_len)));
    if (storage[key] != undefined) {
        const val = storage[key];
        registers[register_id] = val;
        return 1n;
    } else {
        return 0n;
    }
}

export function storage_has_key(key_len, key_ptr) {
    const key = new TextDecoder().decode(memory.buffer.slice(Number(key_ptr), Number(key_ptr + key_len)));
    return storage[key] != undefined ? 1n : 0n;
}
export function validator_stake() { }
export function validator_total_stake() { }
export function ed25519_verify() { }
