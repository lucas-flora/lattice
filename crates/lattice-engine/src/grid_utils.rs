/// Grid utility functions for 2D simulations with toroidal wrapping.
///
/// Shared by all Rust rule implementations. Pure math, no WASM exports.

/// Toroidal wrapping: maps any integer coordinate to [0, size).
#[inline(always)]
pub fn wrap(coord: i32, size: u32) -> u32 {
    ((coord % size as i32 + size as i32) % size as i32) as u32
}

/// Convert 2D coordinates to a flat index.
#[inline(always)]
pub fn index_2d(x: u32, y: u32, width: u32) -> usize {
    (y * width + x) as usize
}

/// Return Moore neighborhood (8 neighbors) flat indices for a 2D toroidal grid.
#[inline(always)]
pub fn get_neighbor_indices_2d(x: u32, y: u32, width: u32, height: u32) -> [usize; 8] {
    let xi = x as i32;
    let yi = y as i32;
    [
        index_2d(wrap(xi - 1, width), wrap(yi - 1, height), width), // top-left
        index_2d(x, wrap(yi - 1, height), width),                   // top
        index_2d(wrap(xi + 1, width), wrap(yi - 1, height), width), // top-right
        index_2d(wrap(xi - 1, width), y, width),                    // left
        index_2d(wrap(xi + 1, width), y, width),                    // right
        index_2d(wrap(xi - 1, width), wrap(yi + 1, height), width), // bottom-left
        index_2d(x, wrap(yi + 1, height), width),                   // bottom
        index_2d(wrap(xi + 1, width), wrap(yi + 1, height), width), // bottom-right
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wrap_positive() {
        assert_eq!(wrap(3, 10), 3);
        assert_eq!(wrap(0, 10), 0);
        assert_eq!(wrap(9, 10), 9);
    }

    #[test]
    fn test_wrap_overflow() {
        assert_eq!(wrap(10, 10), 0);
        assert_eq!(wrap(11, 10), 1);
        assert_eq!(wrap(20, 10), 0);
    }

    #[test]
    fn test_wrap_negative() {
        assert_eq!(wrap(-1, 10), 9);
        assert_eq!(wrap(-2, 10), 8);
        assert_eq!(wrap(-10, 10), 0);
        assert_eq!(wrap(-11, 10), 9);
    }

    #[test]
    fn test_index_2d() {
        // 4x4 grid: (0,0)=0, (1,0)=1, (0,1)=4, (3,3)=15
        assert_eq!(index_2d(0, 0, 4), 0);
        assert_eq!(index_2d(1, 0, 4), 1);
        assert_eq!(index_2d(0, 1, 4), 4);
        assert_eq!(index_2d(3, 3, 4), 15);
    }

    #[test]
    fn test_neighbor_indices_center() {
        // 4x4 grid, cell (2, 2) = index 10
        let neighbors = get_neighbor_indices_2d(2, 2, 4, 4);
        // Expected neighbors: (1,1)=5, (2,1)=6, (3,1)=7, (1,2)=9, (3,2)=11, (1,3)=13, (2,3)=14, (3,3)=15
        assert_eq!(neighbors.len(), 8);
        assert_eq!(neighbors[0], 5);  // top-left
        assert_eq!(neighbors[1], 6);  // top
        assert_eq!(neighbors[2], 7);  // top-right
        assert_eq!(neighbors[3], 9);  // left
        assert_eq!(neighbors[4], 11); // right
        assert_eq!(neighbors[5], 13); // bottom-left
        assert_eq!(neighbors[6], 14); // bottom
        assert_eq!(neighbors[7], 15); // bottom-right
    }

    #[test]
    fn test_neighbor_indices_corner_toroidal() {
        // 4x4 grid, cell (0, 0) = index 0
        // With toroidal wrapping, top-left neighbor is (3, 3) = index 15
        let neighbors = get_neighbor_indices_2d(0, 0, 4, 4);
        assert_eq!(neighbors[0], 15); // top-left wraps to (3, 3)
        assert_eq!(neighbors[1], 12); // top wraps to (0, 3)
        assert_eq!(neighbors[2], 13); // top-right wraps to (1, 3)
        assert_eq!(neighbors[3], 3);  // left wraps to (3, 0)
        assert_eq!(neighbors[4], 1);  // right is (1, 0)
        assert_eq!(neighbors[5], 7);  // bottom-left wraps to (3, 1)
        assert_eq!(neighbors[6], 4);  // bottom is (0, 1)
        assert_eq!(neighbors[7], 5);  // bottom-right is (1, 1)
    }
}
