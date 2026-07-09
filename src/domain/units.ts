/**
 * Real-world unit conversions. The domain stores every length in millimeters
 * (see the scope note in docs/user-stories.md); these helpers let calling code
 * express dimensions in the units a hobbyist actually reaches for.
 */

import {requireFinite} from '../lib/validate';

/** Millimeters in one inch (exact, by definition). */
export const MM_PER_INCH = 25.4;

/** Inches in one foot. */
export const INCHES_PER_FOOT = 12;

/** Converts a measurement in inches to millimeters. */
export function inches(value: number): number {
  return requireFinite(value, 'inches') * MM_PER_INCH;
}

/** Converts a measurement in feet to millimeters. */
export function feet(value: number): number {
  return requireFinite(value, 'feet') * INCHES_PER_FOOT * MM_PER_INCH;
}

/** Converts a measurement in millimeters back to inches. */
export function toInches(millimeters: number): number {
  return requireFinite(millimeters, 'millimeters') / MM_PER_INCH;
}
