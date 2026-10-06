/** Bag tags are printed as "BAG-" and ten hex digits (custody/models.py). */
const BAG_CODE = /^BAG-[0-9A-F]{10}$/;

/** A scanned or typed code, tidied; null when it can't be one of ours.
 * Catching a typo here, at the door, beats finding it when the phone syncs. */
export function parseBagCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return BAG_CODE.test(code) ? code : null;
}
