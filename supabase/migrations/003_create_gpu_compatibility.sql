-- GPU compatibility map: tracks which adapters/browsers pass the proof-of-life test
CREATE TABLE gpu_compatibility (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Browser/OS
  browser TEXT NOT NULL,
  user_agent TEXT,
  -- Adapter info
  gpu_vendor TEXT,
  gpu_architecture TEXT,
  gpu_device TEXT,
  gpu_description TEXT,
  -- Device limits
  max_storage_buffer_mb FLOAT,
  max_buffer_size_mb FLOAT,
  max_compute_workgroups_per_dim INT,
  max_workgroup_size_x INT,
  max_workgroup_size_y INT,
  max_workgroup_size_z INT,
  max_invocations_per_workgroup INT,
  -- Test results
  test_passed BOOLEAN NOT NULL,
  cells_correct INT,
  cells_total INT,
  init_ms FLOAT,
  compile_ms FLOAT,
  dispatch_ms FLOAT,
  readback_ms FLOAT,
  total_ms FLOAT,
  -- Computed max grid sizes
  max_grid_4ch INT,
  max_grid_8ch INT,
  max_grid_16ch INT,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_gpu_compat_vendor ON gpu_compatibility(gpu_vendor, gpu_architecture);
CREATE INDEX idx_gpu_compat_browser ON gpu_compatibility(browser);
CREATE INDEX idx_gpu_compat_created ON gpu_compatibility(created_at DESC);

ALTER TABLE gpu_compatibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous inserts" ON gpu_compatibility FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous reads" ON gpu_compatibility FOR SELECT TO anon USING (true);
