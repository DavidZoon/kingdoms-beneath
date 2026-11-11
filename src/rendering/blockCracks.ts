type Point = readonly [number, number];
export interface CrackSegment {
  from: Point;
  to: Point;
}

const paths: readonly (readonly Point[])[] = [
  [[16, 16], [13, 13], [15, 9], [9, 5], [6, 0]],
  [[16, 16], [20, 15], [22, 19], [27, 18], [32, 22]],
  [[16, 16], [15, 21], [12, 24], [14, 29], [12, 32]],
  [[16, 16], [11, 18], [7, 15], [3, 18], [0, 17]],
];

export function getCrackSegments(progress: number): CrackSegment[] {
  const amount = Math.max(0, Math.min(1, progress));
  const segments: CrackSegment[] = [];
  for (const path of paths) {
    const length = amount * (path.length - 1);
    for (let index = 0; index < length; index++) {
      const from = path[index];
      const end = path[index + 1];
      const fraction = Math.min(1, length - index);
      segments.push({
        from,
        to: [from[0] + (end[0] - from[0]) * fraction, from[1] + (end[1] - from[1]) * fraction],
      });
    }
  }
  return segments;
}
