export type CoinResult = 'HEADS' | 'TAILS';

export interface RngProvider {
  nextFloat(): number;
  flipCoin(): CoinResult;
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * Deterministic PRNG based on Mulberry32.
 * Produces identical sequences for the same seed across all platforms.
 */
export function createSeededRng(seed: number): RngProvider {
  let state = seed >>> 0;

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const flipCoin = (): CoinResult => (nextFloat() < 0.5 ? 'HEADS' : 'TAILS');

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(nextFloat() * (i + 1));
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  };

  return { nextFloat, flipCoin, shuffle };
}

/**
 * Controllable RNG for unit tests and edge-case verification.
 * Consumes pre-defined coin results in order, falling back to a seeded PRNG.
 */
export function createMockRng(
  coinSequence: readonly CoinResult[],
  fallbackSeed = 12345,
): RngProvider {
  const fallback = createSeededRng(fallbackSeed);
  let coinIndex = 0;

  return {
    nextFloat: () => fallback.nextFloat(),
    flipCoin: () => {
      if (coinIndex < coinSequence.length) {
        const result = coinSequence[coinIndex]!;
        coinIndex++;
        return result;
      }
      return fallback.flipCoin();
    },
    shuffle: <T>(items: readonly T[]) => [...items],
  };
}

export function createSystemRng(): RngProvider {
  const seed = Math.floor(Math.random() * 0xffffffff);
  return createSeededRng(seed);
}
