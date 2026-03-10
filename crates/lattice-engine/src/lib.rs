use wasm_bindgen::prelude::*;

/// Proof-of-concept: doubles a number.
/// Validates the full wasm-bindgen-cli pipeline works.
#[wasm_bindgen]
pub fn hello(n: u32) -> u32 {
    n * 2
}

/// Proof-of-concept: adds two numbers.
/// Validates multi-function exports work.
#[wasm_bindgen]
pub fn add(a: f64, b: f64) -> f64 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hello() {
        assert_eq!(hello(5), 10);
        assert_eq!(hello(0), 0);
        assert_eq!(hello(100), 200);
    }

    #[test]
    fn test_add() {
        assert_eq!(add(1.0, 2.0), 3.0);
        assert_eq!(add(0.0, 0.0), 0.0);
        assert_eq!(add(-1.0, 1.0), 0.0);
    }
}
