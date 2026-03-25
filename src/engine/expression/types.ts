/**
 * Type definitions for the unified operator system.
 *
 * An Operator (formerly ExpressionTag) is the universal primitive for all
 * computation logic: links, per-property expressions, multi-property scripts,
 * and global controllers. Operators differ only in complexity and where they
 * live in the object hierarchy.
 */

/** Easing functions (shared with the linking system) */
export type { EasingType, AddressNamespace, ParsedAddress } from '../linking/types';

/** When in the tick pipeline this operator evaluates.
 * 'rule' = THE simulation rule operator on a SimRoot. Receives RuleContext. */
export type ExpressionPhase = 'pre-rule' | 'rule' | 'post-rule' | 'interaction';

/**
 * How the operator was authored.
 * Links are a creation wizard, not a source type — they generate 'code' operators with linkMeta.
 * The 'link' source is deprecated; existing 'link' operators are migrated to 'code' on load.
 */
export type ExpressionSource = 'code' | 'link' | 'script';

/** What type of object owns this operator */
export type OperatorOwnerType = 'cell-type' | 'environment' | 'global' | 'root';
/** @deprecated Use OperatorOwnerType */
export type TagOwnerType = OperatorOwnerType;

/** Identifies the owner object in the hierarchy */
export interface OperatorOwner {
  type: OperatorOwnerType;
  /** Cell type ID when type === 'cell-type' */
  id?: string;
}
/** @deprecated Use OperatorOwner */
export type TagOwner = OperatorOwner;

/** Metadata preserved for operators created via link.add (enables fast-path JS resolution) */
export interface LinkMeta {
  sourceAddress: string;
  sourceRange: [number, number];
  targetRange: [number, number];
  easing: import('../linking/types').EasingType;
}

/**
 * Operator: the universal computation primitive.
 *
 * All computation logic — links, property expressions, multi-property scripts,
 * global controllers — is an Operator. Operators differ only in complexity
 * and where they live in the object hierarchy.
 *
 * Formerly called ExpressionTag.
 */
export interface Operator {
  id: string;
  /** User-visible name */
  name: string;
  /** What object this operator lives on */
  owner: OperatorOwner;
  /** Python code (or auto-generated from link) */
  code: string;
  /** When in the tick pipeline this operator evaluates */
  phase: ExpressionPhase;
  /** Whether this operator is active */
  enabled: boolean;
  /** How it was authored */
  source: ExpressionSource;
  /** Declared input addresses (for dependency tracking) */
  inputs: string[];
  /** Declared output addresses (for dependency tracking) */
  outputs: string[];
  /** Link metadata — present on operators created via link wizard. Enables JS fast-path resolution. */
  linkMeta?: LinkMeta;
  /** Node graph metadata — present on operators authored via the visual node editor. */
  nodeGraph?: import('../nodes/types').NodeGraph;
}

/** @deprecated Use Operator */
export type ExpressionTag = Operator;

/** Definition for creating a new Operator (ID auto-generated) */
export type OperatorDef = Omit<Operator, 'id'>;
/** @deprecated Use OperatorDef */
export type ExpressionTagDef = OperatorDef;
