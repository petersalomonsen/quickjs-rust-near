extern crate bindgen;

use std::env;
use std::path::Path;
use std::process::Command;

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();

    // Call the bash script
    let status = Command::new("bash")
        .current_dir("./quickjslib")
        .arg("build.sh") // adjust the path to your bash script
        .status()
        .expect("Failed to execute bash script");

    // Check if the script succeeded
    if !status.success() {
        panic!("Bash script failed");
    }
    println!(
        "cargo:rustc-link-search=native={}",
        Path::new(&dir)
            .join("emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten")
            .display()
    );
    println!(
        "cargo:rustc-link-search=native={}",
        Path::new(&dir).join("quickjslib").display()
    );
    println!(
        "cargo:rustc-link-search=native={}",
        Path::new(&dir).join("quickjs-2024-01-13").display()
    );
    //println!("cargo:rustc-link-search=native={}", Path::new(&dir).join("lib").display());
    println!("cargo:rustc-link-lib=static=quickjs");
    println!("cargo:rustc-link-lib=static=jseval");
    //println!("cargo:rustc-link-lib=static=c-optz");
    println!("cargo:rustc-link-lib=static=emmalloc");
    println!("cargo:rustc-link-lib=static=compiler_rt");
    println!("cargo:rustc-link-lib=static=standalonewasm");
}
