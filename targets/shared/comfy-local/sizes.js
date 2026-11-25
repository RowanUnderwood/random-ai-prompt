/**
 * Krea sizing: a short edge plus an aspect ratio, expressed over the one stored width × height (so the
 * CLI, saved images and Render another keep working unchanged).
 * @module targets/shared/comfy-local/sizes
 */

/** Pixel dimensions snap to this, like the workflow's own resolution selector. */
export const SIZE_MULTIPLE = 8;

/** Each ratio appears once, with its common names combined. */
export const RATIO_GROUPS = [
  { label: "Square", ratios: [{ id: "1:1", w: 1, h: 1, label: "Square" }] },
  {
    label: "Landscape",
    ratios: [
      { id: "5:4", w: 5, h: 4, label: "Large format" },
      { id: "4:3", w: 4, h: 3, label: "Standard" },
      { id: "3:2", w: 3, h: 2, label: "Photo" },
      { id: "16:10", w: 16, h: 10, label: "Desktop" },
      { id: "16:9", w: 16, h: 9, label: "Widescreen" },
    ],
  },
  {
    label: "Cinematic",
    ratios: [
      { id: "1.85:1", w: 1.85, h: 1, label: "Film" },
      { id: "2.39:1", w: 2.39, h: 1, label: "Anamorphic" },
      { id: "21:9", w: 21, h: 9, label: "Ultrawide" },
    ],
  },
  {
    label: "Portrait",
    ratios: [
      { id: "4:5", w: 4, h: 5, label: "Social portrait" },
      { id: "3:4", w: 3, h: 4, label: "Portrait" },
      { id: "2:3", w: 2, h: 3, label: "Poster / photo" },
      { id: "9:16", w: 9, h: 16, label: "Phone / story" },
      { id: "1:2", w: 1, h: 2, label: "Tall banner" },
    ],
  },
];

const RATIOS = RATIO_GROUPS.flatMap((group) => group.ratios);

export const ratioById = (id) => RATIOS.find((ratio) => ratio.id === id);

const snap = (pixels) =>
  Math.max(SIZE_MULTIPLE, Math.round(pixels / SIZE_MULTIPLE) * SIZE_MULTIPLE);

/**
 * @param {number} shortEdge The shorter side, in pixels.
 * @param {{w: number, h: number}} ratio Any width : height proportion.
 * @returns {{width: number, height: number}} Valid pixel dimensions.
 */
export function sizeFor(shortEdge, { w, h }) {
  const short = snap(shortEdge);
  const long = snap((short * Math.max(w, h)) / Math.min(w, h));
  return w >= h ? { width: long, height: short } : { width: short, height: long };
}

/**
 * Read a stored size back as a short edge and, when one produces it exactly, a listed ratio.
 * @returns {{shortEdge: number, ratio: object|null}} `ratio` is null for a custom size.
 */
export function describeSize(width, height) {
  const shortEdge = Math.min(width, height);
  const ratio = RATIOS.find((candidate) => {
    const size = sizeFor(shortEdge, candidate);
    return size.width === width && size.height === height;
  });
  return { shortEdge, ratio: ratio || null };
}
