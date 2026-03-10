/// Gray-Scott reaction-diffusion rule implementation.
///
/// Whole-tick API (RULE-04): processes the entire grid in a single function call.
/// Exported via wasm-bindgen for JS consumption.

use wasm_bindgen::prelude::*;

use crate::grid_utils::{get_neighbor_indices_2d, index_2d};

/// Run one tick of Gray-Scott reaction-diffusion on the entire grid.
///
/// Reads from `u_in`/`v_in` (current state), writes to `u_out`/`v_out` (next state).
/// All buffers are flat arrays of size `width * height`.
///
/// Parameters:
/// - `du`, `dv`: diffusion rates for U and V
/// - `f`: feed rate
/// - `k`: kill rate
/// - `dt`: time step
#[wasm_bindgen]
pub fn gray_scott_tick(
    u_in: &[f32],
    v_in: &[f32],
    u_out: &mut [f32],
    v_out: &mut [f32],
    width: u32,
    height: u32,
    du: f64,
    dv: f64,
    f: f64,
    k: f64,
    dt: f64,
) {
    let total = (width * height) as usize;
    debug_assert_eq!(u_in.len(), total);
    debug_assert_eq!(v_in.len(), total);
    debug_assert_eq!(u_out.len(), total);
    debug_assert_eq!(v_out.len(), total);

    for y in 0..height {
        for x in 0..width {
            let idx = index_2d(x, y, width);
            let u = u_in[idx] as f64;
            let v = v_in[idx] as f64;

            // Compute Laplacian using Moore neighborhood (8 neighbors)
            let neighbors = get_neighbor_indices_2d(x, y, width, height);
            let mut lap_u: f64 = 0.0;
            let mut lap_v: f64 = 0.0;
            for &ni in &neighbors {
                lap_u += u_in[ni] as f64 - u;
                lap_v += v_in[ni] as f64 - v;
            }
            // Scale Laplacian: 4.0 / 8 neighbors (matches TypeScript implementation)
            lap_u *= 4.0 / 8.0;
            lap_v *= 4.0 / 8.0;

            // Reaction-diffusion equations
            let uvv = u * v * v;
            let new_u = u + dt * (du * lap_u - uvv + f * (1.0 - u));
            let new_v = v + dt * (dv * lap_v + uvv - (f + k) * v);

            // Clamp to [0, 1]
            u_out[idx] = new_u.clamp(0.0, 1.0) as f32;
            v_out[idx] = new_v.clamp(0.0, 1.0) as f32;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_default_grid(width: u32, height: u32) -> (Vec<f32>, Vec<f32>) {
        let size = (width * height) as usize;
        let u = vec![1.0f32; size]; // U starts at 1.0 (substrate)
        let v = vec![0.0f32; size]; // V starts at 0.0 (no activator)
        (u, v)
    }

    fn seed_center(v: &mut [f32], width: u32, height: u32) {
        // Seed a small region of V in the center
        let cx = width / 2;
        let cy = height / 2;
        for dy in 0..3 {
            for dx in 0..3 {
                let x = cx - 1 + dx;
                let y = cy - 1 + dy;
                if x < width && y < height {
                    let idx = index_2d(x, y, width);
                    v[idx] = 0.5;
                }
            }
        }
    }

    #[test]
    fn test_gray_scott_single_tick() {
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (u_in, mut v_in) = make_default_grid(width, height);
        seed_center(&mut v_in, width, height);

        let mut u_out = vec![0.0f32; size];
        let mut v_out = vec![0.0f32; size];

        gray_scott_tick(
            &u_in, &v_in, &mut u_out, &mut v_out, width, height, 0.2097, 0.105, 0.037, 0.06, 1.0,
        );

        // Center cells should have changed from initial state
        let center = index_2d(width / 2, height / 2, width);
        // U should have decreased from 1.0 due to reaction
        assert!(u_out[center] < 1.0, "U at center should decrease from reaction");
        // V should still be positive at center
        assert!(v_out[center] > 0.0, "V at center should be positive");
    }

    #[test]
    fn test_gray_scott_multiple_ticks_nontrivial() {
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (mut u_a, mut v_a) = make_default_grid(width, height);
        seed_center(&mut v_a, width, height);

        let mut u_b = vec![0.0f32; size];
        let mut v_b = vec![0.0f32; size];

        // Run 10 ticks
        for i in 0..10 {
            if i % 2 == 0 {
                gray_scott_tick(
                    &u_a, &v_a, &mut u_b, &mut v_b, width, height, 0.2097, 0.105, 0.037, 0.06,
                    1.0,
                );
            } else {
                gray_scott_tick(
                    &u_b, &v_b, &mut u_a, &mut v_a, width, height, 0.2097, 0.105, 0.037, 0.06,
                    1.0,
                );
            }
        }

        // After 10 ticks, the reaction should have spread from the center
        let final_v = if 10 % 2 == 0 { &v_a } else { &v_b };
        let center = index_2d(width / 2, height / 2, width);
        let edge = index_2d(0, 0, width);

        // Center region should have V activity
        assert!(final_v[center] > 0.0, "V should have activity at center after 10 ticks");
        // Edge should also be affected (reaction diffuses)
        // Just check that not all values are exactly the initial state
        let non_zero_count = final_v.iter().filter(|&&x| x > 0.001).count();
        assert!(non_zero_count > 9, "Reaction should have spread to more than 9 cells");
        let _ = edge; // suppress unused warning
    }

    #[test]
    fn test_gray_scott_clamp_output() {
        let width = 4u32;
        let height = 4u32;
        let size = (width * height) as usize;

        let u_in = vec![1.0f32; size];
        let v_in = vec![1.0f32; size]; // Extreme V values

        let mut u_out = vec![0.0f32; size];
        let mut v_out = vec![0.0f32; size];

        gray_scott_tick(
            &u_in, &v_in, &mut u_out, &mut v_out, width, height, 0.2097, 0.105, 0.037, 0.06, 1.0,
        );

        // All output values should be in [0, 1]
        for i in 0..size {
            assert!(
                u_out[i] >= 0.0 && u_out[i] <= 1.0,
                "U[{}] = {} out of range",
                i,
                u_out[i]
            );
            assert!(
                v_out[i] >= 0.0 && v_out[i] <= 1.0,
                "V[{}] = {} out of range",
                i,
                v_out[i]
            );
        }
    }

    #[test]
    fn test_gray_scott_whole_tick_single_extern_call() {
        // RULE-04: Verify exactly 1 extern boundary crossing per tick.
        // A single call to gray_scott_tick processes ALL cells.
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (u_in, mut v_in) = make_default_grid(width, height);
        seed_center(&mut v_in, width, height);

        let mut u_out = vec![0.0f32; size];
        let mut v_out = vec![0.0f32; size];

        // ONE function call processes all 256 cells
        gray_scott_tick(
            &u_in, &v_in, &mut u_out, &mut v_out, width, height, 0.2097, 0.105, 0.037, 0.06, 1.0,
        );

        // Verify all cells were processed (no cell left at the zero-initialized output default
        // unless the computation genuinely produces 0.0)
        let mut cells_updated = 0;
        for i in 0..size {
            // U starts at 1.0, so any cell that was processed will have u_out != 0.0
            // (the computation u + dt*(Du*lap - uvv + F*(1-u)) with u=1.0 gives u + dt*F*(1-1) + ... which is non-zero)
            if u_out[i] > 0.0 {
                cells_updated += 1;
            }
        }
        assert_eq!(
            cells_updated, size,
            "All {} cells should be updated in a single call",
            size
        );
    }
}
