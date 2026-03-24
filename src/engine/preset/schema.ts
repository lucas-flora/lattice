/**
 * Zod schema for YAML preset validation.
 *
 * Defines v1 and v2 preset schemas.
 * v1: flat structure (meta, grid, rule, cell_properties, etc.)
 * v2: scene-graph tree structure (scene nodes with nested children)
 * This is the community-facing API contract.
 */

import { z } from 'zod';

// --- Sub-schemas ---

const CellPropertyTypeSchema = z.enum(['bool', 'int', 'float', 'vec2', 'vec3', 'vec4']);
const PropertyRoleSchema = z.enum(['input', 'output', 'input_output']);

const MetaSchema = z.object({
  name: z.string().min(1, 'Preset name is required'),
  author: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const GridSchema = z
  .object({
    dimensionality: z.enum(['1d', '2d', '3d']),
    width: z.number().int().positive('Grid width must be a positive integer'),
    height: z.number().int().positive('Grid height must be a positive integer').optional(),
    depth: z.number().int().positive('Grid depth must be a positive integer').optional(),
    topology: z.enum(['toroidal', 'finite']),
  })
  .refine(
    (data) => {
      if (data.dimensionality === '2d' || data.dimensionality === '3d') {
        return data.height !== undefined;
      }
      return true;
    },
    { message: 'height is required for 2d and 3d grids', path: ['height'] },
  )
  .refine(
    (data) => {
      if (data.dimensionality === '3d') {
        return data.depth !== undefined;
      }
      return true;
    },
    { message: 'depth is required for 3d grids', path: ['depth'] },
  );

const CellPropertySchema = z.object({
  name: z.string().min(1, 'Property name is required'),
  type: CellPropertyTypeSchema,
  default: z.union([z.number(), z.array(z.number())]),
  role: PropertyRoleSchema.optional(),
  compute: z.string().optional(),
  expression: z.string().optional(),
});

/** A single compute stage in a multi-pass rule */
const RuleStageSchema = z.object({
  name: z.string().min(1),
  compute: z.string().min(1),
  /** Run this stage N times (e.g. 20 for Jacobi pressure solve) */
  iterations: z.number().int().positive().optional(),
});

const RuleSchema = z.object({
  type: z.enum(['webgpu', 'python', 'typescript', 'wasm']),
  /** Single-pass rule compute body (mutually exclusive with stages) */
  compute: z.string().optional(),
  /** Multi-pass rule: ordered array of compute stages (mutually exclusive with compute) */
  stages: z.array(RuleStageSchema).optional(),
  /** Name of the WASM function to call (deprecated — WASM rules are no longer supported). */
  wasm_module: z.string().optional(),
  /** TypeScript compute body used as fallback (deprecated — all rules transpile to WGSL). */
  fallback_compute: z.string().optional(),
}).refine(
  (data) => data.compute || (data.stages && data.stages.length > 0),
  { message: 'Rule must have either compute or stages' },
);

const ColorStopSchema = z.object({
  t: z.number().min(0).max(1),
  color: z.string().optional(),
  alpha: z.number().min(0).max(1).optional(),
});

const VisualMappingSchema = z.object({
  property: z.string().optional(),
  channel: z.enum(['color', 'alpha', 'size', 'shape', 'orientation']).optional(),
  mapping: z.record(z.unknown()).optional(),
  /** "ramp" for multi-stop gradient compiled to GPU; "script" for freeform Python code */
  type: z.enum(['ramp', 'script']).optional(),
  /** Input value range for normalization [min, max]. Defaults to [0, 1]. */
  range: z.tuple([z.number(), z.number()]).optional(),
  /** Color/alpha stops for ramp mode. Must have at least 1 stop. */
  stops: z.array(ColorStopSchema).optional(),
  /** Python-subset code for script mode. Reads cell properties, writes colorR/G/B/alpha. */
  code: z.string().optional(),
  /** Scope this mapping to a specific cell type (by id). */
  cell_type: z.string().optional(),
});

const ParamDefSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(['float', 'int']),
  default: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

const GlobalVariableSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['float', 'int', 'string']),
  default: z.union([z.number(), z.string()]),
});

const GlobalScriptSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  code: z.string(),
});

const ParameterLinkSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  sourceRange: z.tuple([z.number(), z.number()]).optional().default([0, 1]),
  targetRange: z.tuple([z.number(), z.number()]).optional().default([0, 1]),
  easing: z.enum(['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut']).optional().default('linear'),
  enabled: z.boolean().optional().default(true),
});

const ExpressionTagSchema = z.object({
  name: z.string().min(1),
  owner: z.object({
    type: z.enum(['cell-type', 'environment', 'global', 'root']),
    id: z.string().optional(),
  }),
  code: z.string(),
  phase: z.enum(['pre-rule', 'post-rule']).default('post-rule'),
  enabled: z.boolean().default(true),
  source: z.enum(['code', 'link', 'script']).default('code'),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  linkMeta: z.object({
    sourceAddress: z.string(),
    sourceRange: z.tuple([z.number(), z.number()]),
    targetRange: z.tuple([z.number(), z.number()]),
    easing: z.enum(['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut']),
  }).optional(),
});

// --- Brush schemas ---

const BrushPropertyActionSchema = z.object({
  value: z.number(),
  mode: z.enum(['set', 'add', 'multiply', 'random']),
});

const BrushSchema = z.object({
  name: z.string().min(1),
  properties: z.record(z.string(), BrushPropertyActionSchema),
  radius: z.number().min(1).max(100).default(5),
  shape: z.enum(['circle', 'square']).default('circle'),
  falloff: z.enum(['hard', 'linear', 'smooth']).default('smooth'),
});

const AiContextSchema = z.object({
  description: z.string().optional(),
  hints: z.array(z.string()).optional(),
});

const CellTypeSchema = z.object({
  id: z.string().min(1, 'Cell type id is required'),
  name: z.string().min(1, 'Cell type name is required'),
  parent: z.string().optional(),
  color: z.string().optional(),
  properties: z.array(CellPropertySchema).optional(),
});

// --- Full Preset v1 Schema ---

export const PresetSchema = z
  .object({
    schema_version: z.literal('1', {
      errorMap: () => ({ message: "schema_version must be '1'" }),
    }),
    meta: MetaSchema,
    grid: GridSchema,
    cell_properties: z.array(CellPropertySchema).default([]),
    cell_types: z.array(CellTypeSchema).optional(),
    rule: RuleSchema,
    params: z.array(ParamDefSchema).optional(),
    global_variables: z.array(GlobalVariableSchema).optional(),
    global_scripts: z.array(GlobalScriptSchema).optional(),
    parameter_links: z.array(ParameterLinkSchema).optional(),
    expression_tags: z.array(ExpressionTagSchema).optional(),
    visual_mappings: z.array(VisualMappingSchema).optional(),
    /** Brush definitions for the draw tool. If absent, a single default brush is created. */
    brushes: z.array(BrushSchema).optional(),
    /** Which cell property the draw tool should paint. Defaults to the color-mapped property. */
    draw_property: z.string().optional(),
    /** Initial state seeding script (JS, runs on CPU once at load) */
    initial_state: z.object({
      type: z.literal('script'),
      code: z.string().min(1),
    }).optional(),
    ai_context: AiContextSchema.optional(),
  })
  .refine(
    (data) => {
      return (
        (data.cell_properties && data.cell_properties.length > 0) ||
        (data.cell_types && data.cell_types.length > 0)
      );
    },
    { message: 'At least one of cell_properties or cell_types must be non-empty' },
  );

// --- v2 Sub-schemas ---

const TagV2Schema = z.object({
  name: z.string().min(1),
  code: z.string(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule']).default('post-rule'),
  enabled: z.boolean().default(true),
  source: z.enum(['code', 'link', 'script']).default('code'),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  linkMeta: z.object({
    sourceAddress: z.string(),
    sourceRange: z.tuple([z.number(), z.number()]),
    targetRange: z.tuple([z.number(), z.number()]),
    easing: z.enum(['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut']),
  }).optional(),
});

/** Input type for recursive Zod schema (what the user provides before defaults) */
interface SceneNodeV2Input {
  type: string;
  name: string;
  enabled?: boolean;
  children?: SceneNodeV2Input[];
  properties?: Record<string, unknown>;
  tags?: Array<{
    name: string;
    code: string;
    phase?: 'pre-rule' | 'rule' | 'post-rule';
    enabled?: boolean;
    source?: 'code' | 'link' | 'script';
    inputs?: string[];
    outputs?: string[];
    linkMeta?: {
      sourceAddress: string;
      sourceRange: [number, number];
      targetRange: [number, number];
      easing: 'linear' | 'smoothstep' | 'easeIn' | 'easeOut' | 'easeInOut';
    };
  }>;
}

/** Output type for recursive Zod schema (after defaults are applied) */
interface SceneNodeV2Output {
  type: string;
  name: string;
  enabled: boolean;
  children: SceneNodeV2Output[];
  properties: Record<string, unknown>;
  tags: Array<{
    name: string;
    code: string;
    phase: 'pre-rule' | 'rule' | 'post-rule';
    enabled: boolean;
    source: 'code' | 'link' | 'script';
    inputs: string[];
    outputs: string[];
    linkMeta?: {
      sourceAddress: string;
      sourceRange: [number, number];
      targetRange: [number, number];
      easing: 'linear' | 'smoothstep' | 'easeIn' | 'easeOut' | 'easeInOut';
    };
  }>;
}

const SceneNodeV2Schema: z.ZodType<SceneNodeV2Output, z.ZodTypeDef, SceneNodeV2Input> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean().default(true),
    children: z.array(SceneNodeV2Schema).default([]),
    properties: z.record(z.unknown()).default({}),
    tags: z.array(TagV2Schema).default([]),
  }),
);

const GridV2Schema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  topology: z.string().default('toroidal'),
});

// --- Full Preset v2 Schema ---

export const PresetV2Schema = z.object({
  schema_version: z.literal('2', {
    errorMap: () => ({ message: "schema_version must be '2' for v2 presets" }),
  }),
  grid: GridV2Schema,
  scene: z.array(SceneNodeV2Schema).min(1, 'scene must contain at least one node'),
});

// --- Exported v2 types ---

export type PresetV2Config = z.infer<typeof PresetV2Schema>;
export type SceneNodeV2 = z.infer<typeof SceneNodeV2Schema>;
export type TagV2 = z.infer<typeof TagV2Schema>;

// --- Exported brush types ---

export type BrushPropertyAction = z.infer<typeof BrushPropertyActionSchema>;
export type Brush = z.infer<typeof BrushSchema>;
