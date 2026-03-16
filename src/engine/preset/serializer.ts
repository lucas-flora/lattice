/**
 * Serializer: SceneGraph to v2 preset format.
 *
 * Converts a SceneGraph (flat node map with parent/child IDs) into a
 * nested v2 preset structure suitable for YAML serialization.
 * Also provides the reverse: v2 preset back into a SceneGraph.
 */

import type { SceneGraph } from '../scene/SceneGraph';
import type { SceneNode } from '../scene/SceneNode';
import type { ExpressionTag } from '../expression/types';
import type { ExpressionTagRegistry } from '../expression/ExpressionTagRegistry';
import type { PresetV2Config, SceneNodeV2, TagV2 } from './schema';

/** Grid config extracted from a SimRoot node's properties */
interface GridConfig {
  width: number;
  height: number;
  topology: string;
}

/**
 * Serialize a SceneGraph into a v2 preset object.
 *
 * @param graph - The scene graph to serialize
 * @param tagRegistry - Optional tag registry to inline tag data (code, inputs, outputs).
 *                      If omitted, tags are serialized as empty stubs with just the ID-based name.
 * @param gridOverride - Optional grid config. If not provided, extracted from the first SimRoot node.
 */
export function serializeSceneGraph(
  graph: SceneGraph,
  tagRegistry?: ExpressionTagRegistry,
  gridOverride?: GridConfig,
): PresetV2Config {
  const roots = graph.getRoots();

  // Extract grid config from first sim-root if not overridden
  const grid = gridOverride ?? extractGridFromRoots(roots);

  // Recursively serialize each root node
  const scene: SceneNodeV2[] = roots.map((root) =>
    serializeNode(root, graph, tagRegistry),
  );

  return {
    schema_version: '2',
    grid,
    scene,
  };
}

/**
 * Extract grid config from the first sim-root node's properties.
 */
function extractGridFromRoots(roots: SceneNode[]): GridConfig {
  for (const root of roots) {
    if (root.type === 'sim-root' && root.properties) {
      return {
        width: (root.properties.gridWidth as number) ?? 128,
        height: (root.properties.gridHeight as number) ?? 128,
        topology: (root.properties.topology as string) ?? 'toroidal',
      };
    }
  }
  // Fallback defaults
  return { width: 128, height: 128, topology: 'toroidal' };
}

/**
 * Recursively serialize a SceneNode into a v2 SceneNodeV2.
 */
function serializeNode(
  node: SceneNode,
  graph: SceneGraph,
  tagRegistry?: ExpressionTagRegistry,
): SceneNodeV2 {
  const children = graph.getChildren(node.id);

  // Serialize tags: inline the full tag data if registry is available
  const tags: TagV2[] = node.tags.map((tagId) => {
    if (tagRegistry) {
      const tag = tagRegistry.get(tagId);
      if (tag) {
        return serializeTag(tag);
      }
    }
    // Fallback: stub tag with just a name
    return {
      name: tagId,
      code: '',
      phase: 'post-rule' as const,
      enabled: true,
      source: 'code' as const,
      inputs: [],
      outputs: [],
    };
  });

  const result: SceneNodeV2 = {
    type: node.type,
    name: node.name,
    enabled: node.enabled,
    children: children.map((child) => serializeNode(child, graph, tagRegistry)),
    properties: { ...node.properties },
    tags,
  };

  return result;
}

/**
 * Serialize an ExpressionTag into the v2 tag format.
 */
function serializeTag(tag: ExpressionTag): TagV2 {
  const result: TagV2 = {
    name: tag.name,
    code: tag.code,
    phase: tag.phase,
    enabled: tag.enabled,
    source: tag.source,
    inputs: [...tag.inputs],
    outputs: [...tag.outputs],
  };

  if (tag.linkMeta) {
    result.linkMeta = {
      sourceAddress: tag.linkMeta.sourceAddress,
      sourceRange: [...tag.linkMeta.sourceRange],
      targetRange: [...tag.linkMeta.targetRange],
      easing: tag.linkMeta.easing,
    };
  }

  return result;
}
