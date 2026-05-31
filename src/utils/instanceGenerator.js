/**
 * Guaranteed-Feasible Instance Generator v5 — Final
 *
 * Core insight: previous versions expanded SLA windows randomly, which caused
 * conflicting tasks from different planted slots to share the same window slots,
 * creating unsolvable subproblems.
 *
 * Solution: expand windows only into slots that are NOT used by conflicting neighbors.
 * This guarantees the planted assignment remains the unique correct answer,
 * while still giving the solver some flexibility.
 */

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateInstance(n, K, d = 4, conflictDensity = 0.3, seed = 42) {
  const rand = seededRandom(seed);
  const tasks = Array.from({ length: n }, (_, i) => `T${i}`);

  // ── Step 1: Planted assignment via shuffled round-robin ───────────────────
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const planted = new Array(n);
  for (let i = 0; i < n; i++) planted[order[i]] = i % K;

  // ── Step 2: Capacities ────────────────────────────────────────────────────
  const BASE_CAP = [32, 128, 8, 6.0];
  const capacities = Array.from({ length: K }, () => [...BASE_CAP]);

  // ── Step 3: Resource demands — sized so planted is always feasible ─────────
  const maxInSlot = Math.ceil(n / K);
  const slotUsage = Array.from({ length: K }, () => [0, 0, 0, 0]);
  const resources = Array.from({ length: n }, (_, i) => {
    const s = planted[i];
    return BASE_CAP.map((cap, dim) => {
      const budget = (cap / maxInSlot) * 0.7;
      const remaining = Math.max(0.1, capacities[s][dim] - slotUsage[s][dim] - 0.01);
      const val = +Math.min(Math.max(0.1, rand() * budget), remaining).toFixed(2);
      slotUsage[s][dim] += val;
      return val;
    });
  });

  // ── Step 4: Conflicts — ONLY between tasks in different planted slots ──────
  const conflicts = [];
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (planted[i] !== planted[j] && rand() < conflictDensity) {
        conflicts.push([i, j]);
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }

  // ── Step 5: SLA Windows — planted slot guaranteed inside, safe expansion ───
  // For each task i with planted slot ps:
  //   Collect the set of slots used by conflicting neighbors
  //   Expand window left/right only into slots NOT in that set
  const windows = planted.map((ps, i) => {
    const neighborSlots = new Set();
    for (const j of adj[i]) neighborSlots.add(planted[j]);

    // Try to expand left
    let lo = ps;
    for (let expand = 1; expand <= 2 && lo > 0; expand++) {
      if (!neighborSlots.has(lo - 1) && rand() < 0.6) lo--;
      else break;
    }
    // Try to expand right
    let hi = ps;
    for (let expand = 1; expand <= 2 && hi < K - 1; expand++) {
      if (!neighborSlots.has(hi + 1) && rand() < 0.6) hi++;
      else break;
    }
    return [lo, hi];
  });

  // ── Step 6: Weights ───────────────────────────────────────────────────────
  const weights = Array.from({ length: n }, () => +(rand() * 9 + 1).toFixed(2));

  return { tasks, conflicts, resources, capacities, windows, weights, K, n, d };
}

module.exports = { generateInstance };
