
/**
 * Log factorial to prevent overflow when dealing with large TCG deck combinations
 */
const logFactorial = (n: number): number => {
  let res = 0;
  for (let i = 2; i <= n; i++) res += Math.log(i);
  return res;
};

/**
 * nCr calculation using log space
 */
export const nCr = (n: number, r: number): number => {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  if (r > n / 2) r = n - r;
  return Math.round(Math.exp(logFactorial(n) - logFactorial(r) - logFactorial(n - r)));
};

/**
 * Standard Hypergeometric Probability P(X = k)
 * N: Total population (Deck Size)
 * K: Number of successes in population (Card count)
 * n: Number of draws (Hand size)
 * k: Number of successes in draws
 */
export const hypergeometricPMF = (N: number, K: number, n: number, k: number): number => {
  const numerator = nCr(K, k) * nCr(N - K, n - k);
  const denominator = nCr(N, n);
  return numerator / denominator;
};

/**
 * Cumulative Hypergeometric Probability P(X >= k)
 */
export const hypergeometricCDF = (N: number, K: number, n: number, k: number): number => {
  let prob = 0;
  for (let i = k; i <= Math.min(n, K); i++) {
    prob += hypergeometricPMF(N, K, n, i);
  }
  return prob;
};

/**
 * Multivariate Hypergeometric PMF
 * counts: Total successes per category in population
 * draws: Number of successes per category drawn
 * N: Total population
 * n: Total draws
 */
export const multivariateHypergeometricPMF = (
  populationCounts: number[],
  drawnCounts: number[],
  N: number,
  n: number
): number => {
  if (drawnCounts.reduce((a, b) => a + b, 0) !== n) return 0;
  let numerator = 1;
  for (let i = 0; i < populationCounts.length; i++) {
    numerator *= nCr(populationCounts[i], drawnCounts[i]);
  }
  return numerator / nCr(N, n);
};

/**
 * Recursive generator for all combinations of draws from categories
 * used to sum up probabilities for role-based conditions.
 */
export const getValidDrawVectors = (
  populationCounts: number[],
  totalDraws: number,
  targetRoles: string[],
  atomToRoles: string[][],
  thresholds: { [role: string]: { min: number; max: number } }
): number[][] => {
  const vectors: number[][] = [];
  const current: number[] = new Array(populationCounts.length).fill(0);

  const solve = (idx: number, remaining: number) => {
    if (idx === populationCounts.length - 1) {
      if (remaining <= populationCounts[idx]) {
        current[idx] = remaining;
        // Check if current vector satisfies all role thresholds
        if (checkThresholds(current, atomToRoles, thresholds)) {
          vectors.push([...current]);
        }
      }
      return;
    }

    const maxCanDraw = Math.min(remaining, populationCounts[idx]);
    for (let i = 0; i <= maxCanDraw; i++) {
      current[idx] = i;
      solve(idx + 1, remaining - i);
    }
  };

  const checkThresholds = (
    vector: number[],
    mapping: string[][],
    reqs: { [role: string]: { min: number; max: number } }
  ): boolean => {
    const roleCounts: { [role: string]: number } = {};
    Object.keys(reqs).forEach(r => roleCounts[r] = 0);

    for (let i = 0; i < vector.length; i++) {
      mapping[i].forEach(role => {
        if (roleCounts[role] !== undefined) {
          roleCounts[role] += vector[i];
        }
      });
    }

    return Object.entries(reqs).every(([role, bounds]) => {
      return roleCounts[role] >= bounds.min && roleCounts[role] <= bounds.max;
    });
  };

  solve(0, totalDraws);
  return vectors;
};

export const binomProb = (n: number, k: number, p: number): number => {
  return nCr(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
};
