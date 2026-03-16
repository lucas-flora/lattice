/**
 * Unified expression tag system exports.
 */

export { ExpressionTagRegistry, _resetTagIdCounter } from './ExpressionTagRegistry';
export { parseAddress, resolveRead, resolveWrite } from './PropertyAddress';
export { applyEasing, rangeMap, rangeMapArray } from './easing';
export type {
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
