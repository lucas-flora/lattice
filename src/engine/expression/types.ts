/**
 * Type definitions for the unified expression tag system.
 *
 * An ExpressionTag is the universal primitive for all computation logic:
 * links, per-property expressions, multi-property scripts, and global controllers.
 * Tags differ only in complexity and where they live in the object hierarchy.
 */

/** Easing functions (shared with the linking system) */
export type { EasingType, AddressNamespace, ParsedAddress } from '../linking/types';

/** When in the tick pipeline this tag evaluates */
export type ExpressionPhase = 'pre-rule' | 'post-rule';

/** How the tag was authored (determines fast-path eligibility) */
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
  /** Link metadata — only present when source === 'link' */
  linkMeta?: LinkMeta;
}

/** Definition for creating a new ExpressionTag (ID auto-generated) */
export type ExpressionTagDef = Omit<ExpressionTag, 'id'>;
