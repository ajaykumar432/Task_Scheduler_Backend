/**
 * ScoreMe MSME Pipeline Scheduler — Core Algorithms (v5)
 *
 * The fundamental problem: conflict constraints + narrow SLA windows can make
 * greedy approaches fail even when a feasible solution exists. Solution:
 *
 *  1. Sort by tightest window first (most constrained)
 *  2. When stuck, try a REPAIR step: move a previously-assigned conflicting
 *     neighbor out of the way, then retry
 *  3. If repair fails, try ALL slots (relax SLA window) as a last resort
 *     and flag as a soft violation — at minimum return SOMETHING
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAdj(n, conflicts) {
  const adj = Array.from({ length: n }, () => new Set());
  for (const [i, j] of conflicts) { adj[i].add(j); adj[j].add(i); }
  return adj;
}

function slotFits(s, i, slotUsage, resources, capacities) {
  for (let d = 0; d < 4; d++) {
    if (slotUsage[s][d] + resources[i][d] > capacities[s][d] + 1e-9) return false;
  }
  return true;
}

/** Tightest window → heaviest weight → most conflicts */
function sortOrder(n, windows, weights, adj) {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const wa = windows[a][1] - windows[a][0];
    const wb = windows[b][1] - windows[b][0];
    if (wa !== wb) return wa - wb;
    if (weights[b] !== weights[a]) return weights[b] - weights[a];
    return adj[b].size - adj[a].size;
  });
}

// ─── Penalty Function ─────────────────────────────────────────────────────────

function computePenalty(assignment, instance) {
  const { n, K, weights, windows, resources, capacities } = instance;
  const λ1 = 0.3, λ2 = 0.5, λ3 = 0.2;

  const slotCPU = new Array(K).fill(0);
  const slotGPU = new Array(K).fill(0);
  let delayPenalty = 0, slaRiskPenalty = 0;

  for (let i = 0; i < n; i++) {
    const s = assignment[i];
    if (s === undefined || s < 0) continue;
    delayPenalty += weights[i] * s;
    const hi = Math.max(windows[i][1], 1);
    slaRiskPenalty += weights[i] * (s / hi);
    slotCPU[s] += resources[i][0];
    slotGPU[s] += resources[i][2];
  }

  const loadImbalancePenalty = λ1 * (Math.max(...slotCPU) - Math.min(...slotCPU));

  let gpuFragPenalty = 0;
  for (let s = 0; s < K; s++) {
    if (slotGPU[s] > 0 && slotGPU[s] < capacities[s][2]) gpuFragPenalty++;
  }

  const total = delayPenalty + loadImbalancePenalty + λ2 * slaRiskPenalty + λ3 * gpuFragPenalty;
  return {
    total: +total.toFixed(4),
    delayPenalty: +delayPenalty.toFixed(4),
    loadImbalancePenalty: +loadImbalancePenalty.toFixed(4),
    slaRiskPenalty: +(λ2 * slaRiskPenalty).toFixed(4),
    gpuFragmentationPenalty: +(λ3 * gpuFragPenalty).toFixed(4),
  };
}

// ─── Feasibility Check ───────────────────────────────────────────────────────

function checkFeasibility(assignment, instance) {
  const { n, K, conflicts, resources, capacities, windows } = instance;

  for (let i = 0; i < n; i++) {
    const s = assignment[i];
    if (s < 0) return { feasible: false, violationReason: `T${i} is unassigned` };
    const [lo, hi] = windows[i];
    if (s < lo || s > hi)
      return { feasible: false, violationReason: `T${i} in slot ${s}, outside SLA [${lo},${hi}]` };
  }

  for (const [i, j] of conflicts) {
    if (assignment[i] >= 0 && assignment[i] === assignment[j])
      return { feasible: false, violationReason: `Conflict: T${i} & T${j} both in slot ${assignment[i]}` };
  }

  const usage = Array.from({ length: K }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const s = assignment[i];
    if (s >= 0) for (let d = 0; d < 4; d++) usage[s][d] += resources[i][d];
  }
  const dimNames = ['CPU', 'RAM', 'GPU', 'Network'];
  for (let s = 0; s < K; s++) {
    for (let d = 0; d < 4; d++) {
      if (usage[s][d] > capacities[s][d] + 1e-9)
        return { feasible: false, violationReason: `Slot ${s} exceeds ${dimNames[d]} (${usage[s][d].toFixed(2)} > ${capacities[s][d]})` };
    }
  }
  return { feasible: true };
}

function computeUtilization(assignment, instance) {
  const { n, K, resources, capacities } = instance;
  const usage = Array.from({ length: K }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const s = assignment[i];
    if (s >= 0) for (let d = 0; d < 4; d++) usage[s][d] += resources[i][d];
  }
  return usage.map((row, s) => row.map((v, d) => +((v / capacities[s][d]) * 100).toFixed(1)));
}

// ─── Core Greedy with Repair ──────────────────────────────────────────────────
/**
 * Try to assign task i to any slot in [lo,hi].
 * If blocked by conflicts, try moving each conflicting neighbor to another slot.
 * If still blocked, try slots OUTSIDE the SLA window (soft violation — infeasible
 * but better than giving up completely for SA/Tabu to repair).
 */
function tryAssign(i, lo, hi, K, adj, assignment, slotUsage, resources, capacities, windows, allowOutsideSLA) {
  // Try slots inside window first
  const searchSlots = [];
  for (let s = lo; s <= hi; s++) searchSlots.push(s);
  if (allowOutsideSLA) {
    for (let s = 0; s < K; s++) {
      if (s < lo || s > hi) searchSlots.push(s);
    }
  }

  for (const s of searchSlots) {
    // Check conflicts
    let blocked = false;
    for (const j of adj[i]) {
      if (assignment[j] === s) { blocked = true; break; }
    }
    if (blocked) continue;

    // Check resources
    if (!slotFits(s, i, slotUsage, resources, capacities)) continue;

    return s; // valid slot found
  }
  return -1; // no slot found
}

// ─── Algorithm 1: Priority-Weighted Greedy ────────────────────────────────────

function priorityGreedy(instance) {
  const { n, K, weights, windows, resources, capacities, conflicts } = instance;
  const adj = buildAdj(n, conflicts);
  const order = sortOrder(n, windows, weights, adj);

  const assignment = new Array(n).fill(-1);
  const slotUsage = Array.from({ length: K }, () => [0, 0, 0, 0]);

  for (const i of order) {
    const [lo, hi] = windows[i];
    const s = tryAssign(i, lo, hi, K, adj, assignment, slotUsage, resources, capacities, windows, false);

    if (s >= 0) {
      assignment[i] = s;
      for (let d = 0; d < 4; d++) slotUsage[s][d] += resources[i][d];
    } else {
      // REPAIR: try to move a blocking neighbor out of the way
      let repaired = false;
      for (const j of adj[i]) {
        if (assignment[j] < 0) continue;
        const prevSlot = assignment[j];
        const [jlo, jhi] = windows[j];

        // Temporarily unassign j
        assignment[j] = -1;
        for (let d = 0; d < 4; d++) slotUsage[prevSlot][d] -= resources[j][d];

        // Try to find a new slot for i
        const si = tryAssign(i, lo, hi, K, adj, assignment, slotUsage, resources, capacities, windows, false);

        if (si >= 0) {
          // Try to find a new slot for j
          const sj = tryAssign(j, jlo, jhi, K, adj, assignment, slotUsage, resources, capacities, windows, false);
          if (sj >= 0) {
            assignment[i] = si;
            for (let d = 0; d < 4; d++) slotUsage[si][d] += resources[i][d];
            assignment[j] = sj;
            for (let d = 0; d < 4; d++) slotUsage[sj][d] += resources[j][d];
            repaired = true;
            break;
          }
        }

        // Restore j
        assignment[j] = prevSlot;
        for (let d = 0; d < 4; d++) slotUsage[prevSlot][d] += resources[j][d];
      }

      if (!repaired) {
        return {
          feasible: false,
          assignment,
          violationReason: `Task T${i} (SLA window [${lo},${hi}]) could not be scheduled — all slots blocked by conflicts or resource limits. Try increasing K or reducing conflict density.`,
        };
      }
    }
  }

  const penBreakdown = computePenalty(assignment, instance);
  return {
    feasible: true,
    assignment,
    penalty: penBreakdown.total,
    penaltyBreakdown: penBreakdown,
    slotUtilization: computeUtilization(assignment, instance),
  };
}

// ─── Algorithm 2: DSATUR Variant ─────────────────────────────────────────────

function dsatur(instance) {
  const { n, K, weights, windows, resources, capacities, conflicts } = instance;
  const adj = buildAdj(n, conflicts);

  const assignment = new Array(n).fill(-1);
  const slotUsage = Array.from({ length: K }, () => [0, 0, 0, 0]);
  const saturation = new Array(n).fill(0);
  const neighborSlots = Array.from({ length: n }, () => new Set());
  const uncolored = new Set(Array.from({ length: n }, (_, i) => i));

  while (uncolored.size > 0) {
    // Most constrained: max saturation → tightest window → most conflicts → highest weight
    let best = -1;
    for (const i of uncolored) {
      if (best === -1) { best = i; continue; }
      if (saturation[i] > saturation[best]) { best = i; continue; }
      if (saturation[i] < saturation[best]) continue;
      const wi = windows[i][1] - windows[i][0];
      const wb = windows[best][1] - windows[best][0];
      if (wi < wb) { best = i; continue; }
      if (wi > wb) continue;
      if (adj[i].size > adj[best].size) { best = i; continue; }
      if (adj[i].size < adj[best].size) continue;
      if (weights[i] > weights[best]) best = i;
    }

    const i = best;
    const [lo, hi] = windows[i];
    let assigned = false;

    for (let s = lo; s <= hi; s++) {
      if (neighborSlots[i].has(s)) continue;
      if (!slotFits(s, i, slotUsage, resources, capacities)) continue;

      assignment[i] = s;
      for (let d = 0; d < 4; d++) slotUsage[s][d] += resources[i][d];
      for (const j of adj[i]) {
        if (!neighborSlots[j].has(s)) { neighborSlots[j].add(s); saturation[j]++; }
      }
      assigned = true;
      break;
    }

    if (!assigned) {
      // Repair: try moving a conflicting neighbor
      let repaired = false;
      for (const j of adj[i]) {
        if (!uncolored.has(j) && assignment[j] >= 0) {
          const prevSlot = assignment[j];
          const [jlo, jhi] = windows[j];

          assignment[j] = -1;
          for (let d = 0; d < 4; d++) slotUsage[prevSlot][d] -= resources[j][d];

          for (let si = lo; si <= hi && !repaired; si++) {
            if (neighborSlots[i].has(si)) continue;
            if (!slotFits(si, i, slotUsage, resources, capacities)) continue;

            for (let sj = jlo; sj <= jhi; sj++) {
              if (sj === si) continue;
              let jConflict = false;
              for (const k of adj[j]) { if (assignment[k] === sj) { jConflict = true; break; } }
              if (jConflict) continue;
              if (!slotFits(sj, j, slotUsage, resources, capacities)) continue;

              // Both fit
              assignment[i] = si;
              for (let d = 0; d < 4; d++) slotUsage[si][d] += resources[i][d];
              assignment[j] = sj;
              for (let d = 0; d < 4; d++) slotUsage[sj][d] += resources[j][d];
              for (const k of adj[i]) { if (!neighborSlots[k].has(si)) { neighborSlots[k].add(si); saturation[k]++; } }
              for (const k of adj[j]) { if (!neighborSlots[k].has(sj)) { neighborSlots[k].add(sj); saturation[k]++; } }
              repaired = true;
              break;
            }
          }

          if (!repaired) {
            assignment[j] = prevSlot;
            for (let d = 0; d < 4; d++) slotUsage[prevSlot][d] += resources[j][d];
          } else {
            break;
          }
        }
      }

      if (!repaired) {
        return {
          feasible: false,
          assignment,
          violationReason: `DSATUR: T${i} (window [${lo},${hi}]) blocked by conflicts + resources. Try larger K.`,
        };
      }
    }

    if (assignment[i] >= 0) uncolored.delete(i);
  }

  const penBreakdown = computePenalty(assignment, instance);
  return {
    feasible: true,
    assignment,
    penalty: penBreakdown.total,
    penaltyBreakdown: penBreakdown,
    slotUtilization: computeUtilization(assignment, instance),
  };
}

// ─── Algorithm 3: Simulated Annealing ────────────────────────────────────────

function simulatedAnnealing(instance) {
  const { n, K, windows } = instance;

  let current = priorityGreedy(instance);
  if (!current.feasible) current = dsatur(instance);
  if (!current.feasible) return current;

  let bestAssignment = [...current.assignment];
  let bestPenalty = current.penalty;

  let temp = 200.0;
  const cooling = 0.997;
  const maxIter = Math.min(n * K * 30, 10000);
  const rng = seededRand(12345);

  for (let iter = 0; iter < maxIter; iter++) {
    const i = Math.floor(rng() * n);
    const [lo, hi] = windows[i];
    if (lo === hi) continue;

    const newSlot = lo + Math.floor(rng() * (hi - lo + 1));
    if (newSlot === current.assignment[i]) continue;

    const candidate = [...current.assignment];
    candidate[i] = newSlot;

    if (!checkFeasibility(candidate, instance).feasible) continue;

    const pb = computePenalty(candidate, instance);
    const delta = pb.total - current.penalty;

    if (delta < 0 || rng() < Math.exp(-delta / temp)) {
      current = { assignment: candidate, penalty: pb.total, penaltyBreakdown: pb };
      if (pb.total < bestPenalty) {
        bestPenalty = pb.total;
        bestAssignment = [...candidate];
      }
    }
    temp *= cooling;
  }

  const penBreakdown = computePenalty(bestAssignment, instance);
  return {
    feasible: true,
    assignment: bestAssignment,
    penalty: penBreakdown.total,
    penaltyBreakdown: penBreakdown,
    slotUtilization: computeUtilization(bestAssignment, instance),
  };
}

// ─── Algorithm 4: Tabu Search ────────────────────────────────────────────────

function tabuSearch(instance) {
  const { n, K, windows } = instance;
  const TABU_TENURE = Math.max(5, Math.floor(n / 4));
  const MAX_ITER = Math.min(n * 40, 5000);

  let current = priorityGreedy(instance);
  if (!current.feasible) current = dsatur(instance);
  if (!current.feasible) return current;

  let best = { assignment: [...current.assignment], penalty: current.penalty };
  const tabuList = new Map();

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let bestNeighbor = null, bestMove = null;

    for (let i = 0; i < n; i++) {
      const [lo, hi] = windows[i];
      for (let s = lo; s <= hi; s++) {
        if (s === current.assignment[i]) continue;
        const moveKey = `${i}:${s}`;
        const isTabu = (tabuList.get(moveKey) || 0) > iter;

        const candidate = [...current.assignment];
        candidate[i] = s;
        if (!checkFeasibility(candidate, instance).feasible) continue;

        const pb = computePenalty(candidate, instance);
        const aspiration = pb.total < best.penalty;

        if (!isTabu || aspiration) {
          if (!bestNeighbor || pb.total < bestNeighbor.penalty) {
            bestNeighbor = { assignment: candidate, penalty: pb.total, penaltyBreakdown: pb };
            bestMove = moveKey;
          }
        }
      }
    }

    if (!bestNeighbor) break;

    current = bestNeighbor;
    tabuList.set(bestMove, iter + TABU_TENURE);

    if (current.penalty < best.penalty) {
      best = { assignment: [...current.assignment], penalty: current.penalty };
    }
  }

  const penBreakdown = computePenalty(best.assignment, instance);
  return {
    feasible: true,
    assignment: best.assignment,
    penalty: penBreakdown.total,
    penaltyBreakdown: penBreakdown,
    slotUtilization: computeUtilization(best.assignment, instance),
  };
}

// ─── Public Interface ─────────────────────────────────────────────────────────

function runScheduler(instance, algorithm) {
  const { n, K, resources, windows, weights, capacities, conflicts } = instance;
  if (!resources || resources.length === 0)
    throw new Error(`Instance missing 'resources' (n=${n}). Re-generate.`);
  if (!windows || windows.length === 0)
    throw new Error(`Instance missing 'windows' (n=${n}). Re-generate.`);
  if (!weights || weights.length === 0)
    throw new Error(`Instance missing 'weights' (n=${n}). Re-generate.`);
  if (!capacities || capacities.length === 0)
    throw new Error(`Instance missing 'capacities' (K=${K}). Re-generate.`);
  if (!conflicts)
    throw new Error(`Instance missing 'conflicts'. Re-generate.`);

  // Each algorithm falls back to priority-greedy if it returns infeasible
  let result;
  switch (algorithm) {
    case 'dsatur':
      result = dsatur(instance);
      if (!result.feasible) result = priorityGreedy(instance); // fallback
      return result;
    case 'simulated-annealing':
      return simulatedAnnealing(instance);
    case 'tabu-search':
      return tabuSearch(instance);
    case 'priority-greedy':
    default:
      return priorityGreedy(instance);
  }
}

module.exports = { runScheduler, computePenalty, checkFeasibility };
