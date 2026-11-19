// Reference implementation; authorization and authoritative updates live in PostgreSQL.
export function expectedScore(rating, opponent) {
  if (!Number.isSafeInteger(rating) || !Number.isSafeInteger(opponent)) throw new RangeError('Ratings must be integers');
  return 1 / (1 + 10 ** Math.max(-20, Math.min(20, (opponent - rating) / 400)));
}
// PostgreSQL numeric round rounds half away from zero, unlike Math.round for negatives.
export function transfer(rating, opponent, score) {
  if (![0, 0.5, 1].includes(score)) throw new RangeError('Invalid score');
  const value = 20 * (score - expectedScore(rating, opponent));
  return Math.sign(value) * Math.round(Math.abs(value)) || 0;
}
export function updateRatings(white, black, score) {
  const delta = transfer(white, black, score);
  return { white: white + delta, black: black - delta, delta };
}
export function overall(blitz = 1000, rapid = 1000, classical = 1000) {
  if (![blitz, rapid, classical].every(Number.isSafeInteger)) throw new RangeError('Ratings must be integers');
  const value = (blitz + 2 * rapid + 3 * classical) / 6;
  return Math.sign(value) * Math.round(Math.abs(value)) || 0;
}
