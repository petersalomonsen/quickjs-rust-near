extern crate bindgen;

use std::env;
use std::path::{Path};

fn main() {
    let dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    println!("cargo:rustc-link-search=native={}", Path::new(&dir).join("lib").display());
    println!("cargo:rustc-link-lib=static=quickjs");
    println!("cargo:rustc-link-lib=static=jseval");
    println!("cargo:rustc-link-lib=static=c-optz");
    println!("cargo:rustc-link-lib=static=emmalloc");
    println!("cargo:rustc-link-lib=static=compiler_rt");
    println!("cargo:rustc-link-lib=static=standalonewasm");
}
