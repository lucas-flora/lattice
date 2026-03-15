/**
 * Parameter linking module exports.
 */

export { parseAddress, resolveRead, resolveWrite } from './PropertyAddress';
export { applyEasing, rangeMap, rangeMapArray } from './easing';
export { LinkRegistry } from './LinkRegistry';
export type {
  ParameterLink,
  ParameterLinkDef,
  EasingType,
  ParsedAddress,
  AddressNamespace,
} from './types';
