/**
 * Type definitions for the unified expression tag system.
 *
 * An ExpressionTag is the universal primitive for all computation logic:
 * links, per-property expressions, multi-property scripts, and global controllers.
 * Tags differ only in complexity and where they live in the object hierarchy.
 */

/** Easing functions (shared with the linking system) */
export type { EasingType, AddressNamespace, ParsedAddress } from '../linking/types';

/** When in the tick pipeline this tag evaluates.
 * 'rule' = THE simulation rule tag on a SimRoot. Receives RuleContext. */
export type ExpressionPhase = 'pre-rule' | 'rule' | 'post-rule';

/**
 * How the tag was authored.
 * Links are a creation wizard, not a source type — they generate 'code' tags with linkMeta.
 * The 'link' source is deprecated; existing 'link' tags are migrated to 'code' on load.
 */
export type ExpressionSource = 'code' | 'link' | 'script';

/** What type of object owns this tag */
export type TagOwnerType = 'cell-type' | 'environment' | 'global' | 'root';

/** Identifies the owner object in the hierarchy */
export interface TagOwner {
  type: TagOwnerType;
  /** Cell type ID when type === 'cell-type' */
  id?: string;
}

/** Metadata preserved for tags created via link.add (enables fast-path JS resolution) */
export interface LinkMeta {
  sourceAddress: string;
  sourceRange: [number, number];
  targetRange: [number, number];
  easing: import('../linking/types').EasingType;
}

/**
 * ExpressionTag: the universal computation primitive.
 *
 * All computation logic — links, property expressions, multi-property scripts,
 * global controllers — is an ExpressionTag. Tags differ only in complexity
 * and where they live in the object hierarchy.
 */
export interface ExpressionTag {
  id: string;
  /** User-visible name */
  name: string;
  /** What object this tag lives on */
  owner: TagOwner;
  /** Python code (or auto-generated from link) */
  code: string;
  /** When in the tick pipeline this tag evaluates */
  phase: ExpressionPhase;
  /** Whether this tag is active */
  enabled: boolean;
  /** How it was authored */
  source: ExpressionSource;
  /** Declared input addresses (for dependency tracking) */
  inputs: string[];
  /** Declared output addresses (for dependency tracking) */
  outputs: string[];
  /** Link metadata — present on tags created via link wizard. Enables JS fast-path resolution. */
  linkMeta?: LinkMeta;
  /** Node graph metadata — present on tags authored via the visual node editor. */
  nodeGraph?: import('../nodes/types').NodeGraph;
}

/** Definition for creating a new ExpressionTag (ID auto-generated) */
export type ExpressionTagDef = Omit<ExpressionTag, 'id'>;
