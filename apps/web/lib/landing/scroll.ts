/** Scroll-linked mappings for the landing page, as plain functions of the
 * scroll position.
 *
 * Passed to useTransform as a function (not as input/output arrays), they
 * always run in JavaScript. The array form can be handed to the browser's own
 * scroll timeline, which misreads the range of the tall, pinned sections
 * here and plays the animation at the wrong time. */

/** Piecewise-linear, clamped at both ends. */
export function ramp(value: number, input: number[], output: number[]): number {
  if (value <= input[0]) return output[0];
  for (let i = 1; i < input.length; i += 1) {
    if (value <= input[i]) {
      const t = (value - input[i - 1]) / (input[i] - input[i - 1]);
      return output[i - 1] + (output[i] - output[i - 1]) * t;
    }
  }
  return output[output.length - 1];
}

/** Blend two #rrggbb colours: t=0 is `from`, t=1 is `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const part = (i: number) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t);
  return `rgb(${part(0)} ${part(1)} ${part(2)})`;
}
