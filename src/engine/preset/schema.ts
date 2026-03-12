/**
 * Zod schema for YAML preset validation.
 *
 * Defines the full preset schema with schema_version "1".
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
});

const RuleSchema = z.object({
  type: z.enum(['typescript', 'wasm']),
  compute: z.string().min(1, 'Rule compute function body is required'),
  /** Name of the WASM function to call (e.g., 'gray_scott_tick'). Only used when type is 'wasm'. */
  wasm_module: z.string().optional(),
  /** TypeScript compute body used as fallback when WASM is unavailable. */
  fallback_compute: z.string().optional(),
});

const VisualMappingSchema = z.object({
  property: z.string(),
  channel: z.enum(['color', 'size', 'shape', 'orientation']),
  mapping: z.record(z.unknown()),
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

const AiContextSchema = z.object({
  description: z.string().optional(),
  hints: z.array(z.string()).optional(),
});

// --- Full Preset Schema ---

export const PresetSchema = z.object({
  schema_version: z.literal('1', {
    errorMap: () => ({ message: "schema_version must be '1'" }),
  }),
  meta: MetaSchema,
  grid: GridSchema,
  cell_properties: z.array(CellPropertySchema).min(1, 'At least one cell property is required'),
  rule: RuleSchema,
  params: z.array(ParamDefSchema).optional(),
  visual_mappings: z.array(VisualMappingSchema).optional(),
  ai_context: AiContextSchema.optional(),
});
