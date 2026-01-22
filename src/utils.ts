import type { BBox } from './types';

export function overlapRatio(a: BBox, b: BBox): number {
  const intersectX1 = Math.max(a.x1, b.x1);
  const intersectY1 = Math.max(a.y1, b.y1);
  const intersectX2 = Math.min(a.x2, b.x2);
  const intersectY2 = Math.min(a.y2, b.y2);

  if (intersectX1 >= intersectX2 || intersectY1 >= intersectY2) {
    return 0;
  }

  const intersectArea = (intersectX2 - intersectX1) * (intersectY2 - intersectY1);
  const aArea = (a.x2 - a.x1) * (a.y2 - a.y1);

  return aArea > 0 ? intersectArea / aArea : 0;
}

export function bboxContains(outer: BBox, inner: BBox, threshold = 0.5): boolean {
  return overlapRatio(inner, outer) >= threshold;
}
