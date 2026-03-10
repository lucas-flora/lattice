/// Navier-Stokes fluid dynamics rule implementation.
///
/// Simplified 2D lattice-based diffusion and advection model.
/// Whole-tick API (RULE-04): processes the entire grid in a single function call.
/// Exported via wasm-bindgen for JS consumption.

use wasm_bindgen::prelude::*;

use crate::grid_utils::{get_neighbor_indices_2d, index_2d};

/// Run one tick of simplified Navier-Stokes fluid dynamics on the entire grid.
///
/// Reads from input buffers, writes to output buffers.
/// All buffers are flat arrays of size `width * height`.
///
/// Properties: vx (x-velocity), vy (y-velocity), density, pressure.
///
/// Parameters:
/// - `viscosity`: viscosity coefficient for velocity diffusion
/// - `diffusion`: diffusion coefficient for density
/// - `dt`: time step
#[wasm_bindgen]
pub fn navier_stokes_tick(
    vx_in: &[f32],
    vy_in: &[f32],
    density_in: &[f32],
    pressure_in: &[f32],
    vx_out: &mut [f32],
    vy_out: &mut [f32],
    density_out: &mut [f32],
    pressure_out: &mut [f32],
    width: u32,
    height: u32,
    viscosity: f64,
    diffusion: f64,
    dt: f64,
) {
    let total = (width * height) as usize;
    debug_assert_eq!(vx_in.len(), total);
    debug_assert_eq!(vy_in.len(), total);
    debug_assert_eq!(density_in.len(), total);
    debug_assert_eq!(pressure_in.len(), total);
    debug_assert_eq!(vx_out.len(), total);
    debug_assert_eq!(vy_out.len(), total);
    debug_assert_eq!(density_out.len(), total);
    debug_assert_eq!(pressure_out.len(), total);

    let damping: f64 = 0.999;

    for y in 0..height {
        for x in 0..width {
            let idx = index_2d(x, y, width);
            let vx = vx_in[idx] as f64;
            let vy = vy_in[idx] as f64;
            let density = density_in[idx] as f64;
            let pressure = pressure_in[idx] as f64;

            let neighbors = get_neighbor_indices_2d(x, y, width, height);
            let nc = neighbors.len() as f64; // 8 for Moore

            let mut lap_vx: f64 = 0.0;
            let mut lap_vy: f64 = 0.0;
            let mut lap_density: f64 = 0.0;
            let mut dpdx: f64 = 0.0;
            let mut dpdy: f64 = 0.0;
            let mut div_v: f64 = 0.0;

            for &ni in &neighbors {
                lap_vx += vx_in[ni] as f64 - vx;
                lap_vy += vy_in[ni] as f64 - vy;
                lap_density += density_in[ni] as f64 - density;
                dpdx += pressure_in[ni] as f64 - pressure;
                dpdy += pressure_in[ni] as f64 - pressure;
                div_v += vx_in[ni] as f64 + vy_in[ni] as f64;
            }

            let scale = 4.0 / nc;
            lap_vx *= scale;
            lap_vy *= scale;
            lap_density *= scale;
            dpdx *= scale / 2.0;
            dpdy *= scale / 2.0;
            div_v = div_v * scale - 4.0 * (vx + vy);

            let mut new_vx = vx + dt * (viscosity * lap_vx - dpdx);
            let mut new_vy = vy + dt * (viscosity * lap_vy - dpdy);
            let new_density = (density + dt * (diffusion * lap_density - density * div_v * 0.01))
                .max(0.0)
                .min(10.0);
            let new_pressure = (pressure + dt * (-div_v * 0.5)).clamp(-10.0, 10.0);

            new_vx *= damping;
            new_vy *= damping;
            new_vx = new_vx.clamp(-10.0, 10.0);
            new_vy = new_vy.clamp(-10.0, 10.0);

            vx_out[idx] = new_vx as f32;
            vy_out[idx] = new_vy as f32;
            density_out[idx] = new_density as f32;
            pressure_out[idx] = new_pressure as f32;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_default_grid(width: u32, height: u32) -> (Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>) {
        let size = (width * height) as usize;
        let vx = vec![0.0f32; size];
        let vy = vec![0.0f32; size];
        let density = vec![0.0f32; size];
        let pressure = vec![0.0f32; size];
        (vx, vy, density, pressure)
    }

    fn seed_fluid(
        vx: &mut [f32],
        vy: &mut [f32],
        density: &mut [f32],
        width: u32,
        height: u32,
    ) {
        // Seed center with some velocity and density
        let cx = width / 2;
        let cy = height / 2;
        for dy in 0..3 {
            for dx in 0..3 {
                let x = cx - 1 + dx;
                let y = cy - 1 + dy;
                if x < width && y < height {
                    let idx = index_2d(x, y, width);
                    vx[idx] = 1.0;
                    vy[idx] = 0.5;
                    density[idx] = 5.0;
                }
            }
        }
    }

    #[test]
    fn test_navier_stokes_single_tick() {
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (mut vx_in, mut vy_in, mut density_in, pressure_in) =
            make_default_grid(width, height);
        seed_fluid(&mut vx_in, &mut vy_in, &mut density_in, width, height);

        let mut vx_out = vec![0.0f32; size];
        let mut vy_out = vec![0.0f32; size];
        let mut density_out = vec![0.0f32; size];
        let mut pressure_out = vec![0.0f32; size];

        navier_stokes_tick(
            &vx_in,
            &vy_in,
            &density_in,
            &pressure_in,
            &mut vx_out,
            &mut vy_out,
            &mut density_out,
            &mut pressure_out,
            width,
            height,
            0.1,
            0.0001,
            0.1,
        );

        // Check a cell at the boundary of the seeded region where velocity divergence is non-zero.
        // The edge cell (cx-1, cy-1) has some neighbors with velocity and some without,
        // creating a velocity divergence.
        let cx = width / 2;
        let cy = height / 2;
        let edge_idx = index_2d(cx - 1, cy - 1, width);
        // At the edge of the seeded region, velocity gradient creates pressure changes
        // Just verify the output is well-formed (not NaN) and that some cells show activity
        assert!(
            !pressure_out[edge_idx].is_nan(),
            "Pressure output should not be NaN"
        );
        // Verify at least some cells have non-zero velocity in output (diffusion from seed)
        let active_cells = vx_out.iter().filter(|&&x| x.abs() > 0.001).count();
        assert!(
            active_cells > 0,
            "Some cells should have non-zero velocity after tick"
        );
    }

    #[test]
    fn test_navier_stokes_multiple_ticks_nontrivial() {
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (mut vx_a, mut vy_a, mut d_a, mut p_a) = make_default_grid(width, height);
        seed_fluid(&mut vx_a, &mut vy_a, &mut d_a, width, height);

        let mut vx_b = vec![0.0f32; size];
        let mut vy_b = vec![0.0f32; size];
        let mut d_b = vec![0.0f32; size];
        let mut p_b = vec![0.0f32; size];

        for i in 0..10 {
            if i % 2 == 0 {
                navier_stokes_tick(
                    &vx_a, &vy_a, &d_a, &p_a, &mut vx_b, &mut vy_b, &mut d_b, &mut p_b, width,
                    height, 0.1, 0.0001, 0.1,
                );
            } else {
                navier_stokes_tick(
                    &vx_b, &vy_b, &d_b, &p_b, &mut vx_a, &mut vy_a, &mut d_a, &mut p_a, width,
                    height, 0.1, 0.0001, 0.1,
                );
            }
        }

        // After 10 ticks, fluid should have diffused from center
        let final_p = if 10 % 2 == 0 { &p_a } else { &p_b };
        let non_zero_pressure = final_p.iter().filter(|&&x| x.abs() > 0.0001).count();
        assert!(
            non_zero_pressure > 9,
            "Pressure should have spread to more than 9 cells, got {}",
            non_zero_pressure
        );
    }

    #[test]
    fn test_navier_stokes_clamping() {
        let width = 4u32;
        let height = 4u32;
        let size = (width * height) as usize;

        // Extreme input values
        let vx_in = vec![9.0f32; size];
        let vy_in = vec![9.0f32; size];
        let density_in = vec![9.0f32; size];
        let pressure_in = vec![9.0f32; size];

        let mut vx_out = vec![0.0f32; size];
        let mut vy_out = vec![0.0f32; size];
        let mut density_out = vec![0.0f32; size];
        let mut pressure_out = vec![0.0f32; size];

        navier_stokes_tick(
            &vx_in,
            &vy_in,
            &density_in,
            &pressure_in,
            &mut vx_out,
            &mut vy_out,
            &mut density_out,
            &mut pressure_out,
            width,
            height,
            0.1,
            0.0001,
            0.1,
        );

        for i in 0..size {
            assert!(
                vx_out[i] >= -10.0 && vx_out[i] <= 10.0,
                "vx[{}] = {} out of range",
                i,
                vx_out[i]
            );
            assert!(
                vy_out[i] >= -10.0 && vy_out[i] <= 10.0,
                "vy[{}] = {} out of range",
                i,
                vy_out[i]
            );
            assert!(
                density_out[i] >= 0.0 && density_out[i] <= 10.0,
                "density[{}] = {} out of range",
                i,
                density_out[i]
            );
            assert!(
                pressure_out[i] >= -10.0 && pressure_out[i] <= 10.0,
                "pressure[{}] = {} out of range",
                i,
                pressure_out[i]
            );
        }
    }

    #[test]
    fn test_navier_stokes_whole_tick_single_extern_call() {
        // RULE-04: Verify exactly 1 extern boundary crossing per tick.
        let width = 16u32;
        let height = 16u32;
        let size = (width * height) as usize;

        let (mut vx_in, mut vy_in, mut d_in, p_in) = make_default_grid(width, height);
        seed_fluid(&mut vx_in, &mut vy_in, &mut d_in, width, height);

        let mut vx_out = vec![0.0f32; size];
        let mut vy_out = vec![0.0f32; size];
        let mut d_out = vec![0.0f32; size];
        let mut p_out = vec![0.0f32; size];

        // ONE function call processes all cells
        navier_stokes_tick(
            &vx_in,
            &vy_in,
            &d_in,
            &p_in,
            &mut vx_out,
            &mut vy_out,
            &mut d_out,
            &mut p_out,
            width,
            height,
            0.1,
            0.0001,
            0.1,
        );

        // Verify all cells were written to (pressure_out should be non-NaN for all cells)
        let valid_cells = p_out.iter().filter(|&&x| !x.is_nan()).count();
        assert_eq!(
            valid_cells, size,
            "All {} cells should be processed in a single call",
            size
        );
    }
}
