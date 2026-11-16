// Pure calculation helpers. These are not an authorization boundary: only a
// trusted game server may decide whether a completed game is eligible.
export const MODE_WEIGHTS = Object.freeze({ classic: 1, rapid: 1, blitz: 0.85, bullet: 0.6, bot: 0, friendly: 0 });

export function probabilities(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 2600 || b > 2600) throw new RangeError('Invalid rating');
  // Divide by gamma_b for numerical stability.
  const ratio = 10 ** ((a - b) / 400);
  const draw = 0.9 * Math.sqrt(ratio);
  const total = ratio + 1 + draw;
  return { win: ratio / total, draw: draw / total, loss: 1 / total };
}

export function updateRating(rating, opponent, games, score, mode) {
  if (!Number.isSafeInteger(games) || games < 0) throw new RangeError('Invalid game count');
  if (![0, 0.5, 1].includes(score)) throw new RangeError('Invalid score');
  if (!Object.hasOwn(MODE_WEIGHTS, mode)) throw new RangeError('Invalid mode');
  const p = probabilities(rating, opponent);
  const k = 6 + 42 / (1 + games / 8);
  // The specification defines a 0–2600 scale, but does not specify rounding.
  // Preserve precision; the eventual transactional storage layer decides it.
  return Math.max(0, Math.min(2600, rating + MODE_WEIGHTS[mode] * k * (score - p.win - p.draw / 2)));
}

const thresholds = [0, 800, 1000, 1200, 1400, 1600, 1850, 2100];
export function divisionAfter(rating, division) {
  if (!Number.isFinite(rating) || rating < 0 || rating > 2600 || !Number.isInteger(division) || division < 0 || division >= thresholds.length) throw new RangeError('Invalid division or rating');
  while (division < thresholds.length - 1 && rating >= thresholds[division + 1] + 40) division++;
  while (division > 0 && rating < thresholds[division] - 80) division--;
  return division;
}
