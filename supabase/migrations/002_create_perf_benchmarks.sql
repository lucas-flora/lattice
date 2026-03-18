-- Performance benchmarking table for WebGPU migration tracking
CREATE TABLE perf_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  git_commit TEXT NOT NULL,
  architecture_tag TEXT NOT NULL,  -- e.g. 'baseline-cpu', 'phase-1-gpu-infra', 'phase-3-gpu-sim'
  browser TEXT NOT NULL,           -- e.g. 'Chrome/123.0'
  gpu TEXT,                        -- e.g. 'Apple M4 Max' (from WebGL renderer string)
  test_name TEXT NOT NULL,         -- e.g. 'conway-ts-512'
  grid_width INT NOT NULL,
  grid_height INT NOT NULL,
  metric_name TEXT NOT NULL,       -- e.g. 'tick_ms', 'fps', 'heap_mb', 'render_ms'
  metric_value FLOAT NOT NULL,
  metadata JSONB                   -- extra context (num_properties, rule_type, num_ticks, etc.)
);

-- Index for querying by architecture tag and test name
CREATE INDEX idx_benchmarks_arch_test ON perf_benchmarks(architecture_tag, test_name);
CREATE INDEX idx_benchmarks_created ON perf_benchmarks(created_at DESC);

-- Enable Row Level Security with open read/write for benchmarks (non-sensitive data)
ALTER TABLE perf_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous inserts" ON perf_benchmarks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous reads" ON perf_benchmarks FOR SELECT TO anon USING (true);
