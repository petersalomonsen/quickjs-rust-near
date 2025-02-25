use base64::{engine::general_purpose, Engine as _};
use std::{fs, io::Write, path::Path};
use wabt::wat2wasm;

fn main() {
    let min_self_upgrade_contract_wat_path = "../min_self_upgrade_contract.wat";

    let min_self_upgrade_contract_wat = fs::read(min_self_upgrade_contract_wat_path)
        .expect(format!("Failed to read {}", min_self_upgrade_contract_wat_path).as_str());
    let min_self_upgrade_contract_wasm = wat2wasm(min_self_upgrade_contract_wat).unwrap();

    let min_self_upgrade_contract_wasm_base64 =
        general_purpose::STANDARD.encode(&min_self_upgrade_contract_wasm);

    let target_contract_wasm_base64_path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("min_self_upgrade_contract.wasm.base64.txt");

    let mut output_file =
        fs::File::create(target_contract_wasm_base64_path).expect("Failed to create output file");

    output_file
        .write_all(min_self_upgrade_contract_wasm_base64.as_bytes())
        .expect("Failed to write to output file");
}
