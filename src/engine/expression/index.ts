/**
 * Unified operator system exports (formerly "expression tag system").
 */

export { ExpressionTagRegistry, _resetTagIdCounter } from './ExpressionTagRegistry';
export { parseAddress, resolveRead, resolveWrite } from './PropertyAddress';
export { applyEasing, rangeMap, rangeMapArray } from './easing';
export type {
  Operator,
  OperatorDef,
  OperatorOwner,
  OperatorOwnerType,
  ExpressionTag,
  ExpressionTagDef,
  ExpressionPhase,
  ExpressionSource,
  TagOwner,
  TagOwnerType,
  LinkMeta,
  EasingType,
  ParsedAddress,
  AddressNamespace,
} from './types';
