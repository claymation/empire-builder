/**
 * Small shared guards for the domain layer. Keeping them in one place means
 * every module rejects bad input the same way.
 */

/**
 * Returns `value` if it is a positive, finite number; otherwise throws.
 *
 * @throws RangeError if `value` is not finite or is not greater than zero.
 */
export function requirePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive, finite number`);
  }
  return value;
}

/**
 * Returns `value` if it is a finite number; otherwise throws. Use for
 * quantities that may legitimately be zero or negative (coordinates, offsets).
 *
 * @throws RangeError if `value` is not finite.
 */
export function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
  return value;
}

/** Compile-time exhaustiveness guard for discriminated unions. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
