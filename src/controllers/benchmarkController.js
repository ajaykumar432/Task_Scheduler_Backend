const Benchmark = require('../models/Benchmark');
const { generateInstance } = require('../utils/instanceGenerator');
const { runScheduler } = require('../utils/scheduler');

const BENCHMARK_SUITE = [
  // Small (compare vs brute-force)
  { n: 8,   K: 3,  density: 0.3, seed: 1,  category: 'small' },
  { n: 10,  K: 4,  density: 0.4, seed: 2,  category: 'small' },
  { n: 12,  K: 4,  density: 0.5, seed: 3,  category: 'small' },
  // Medium
  { n: 50,  K: 8,  density: 0.25, seed: 10, category: 'medium' },
  { n: 100, K: 10, density: 0.30, seed: 11, category: 'medium' },
  { n: 150, K: 12, density: 0.35, seed: 12, category: 'medium' },
  // Stress
  { n: 200, K: 15, density: 0.40, seed: 20, category: 'stress' },
  { n: 200, K: 5,  density: 0.60, seed: 21, category: 'stress', note: 'tight K' },
  { n: 200, K: 20, density: 0.10, seed: 22, category: 'stress', note: 'sparse conflicts' },
];

// POST /api/benchmarks/run
exports.runBenchmark = async (req, res, next) => {
  try {
    const { algorithm = 'priority-greedy', name = 'Benchmark Run' } = req.body;

    const benchmark = await Benchmark.create({
      name,
      status: 'running',
      createdBy: req.user._id,
      runs: [],
    });

    const runs = [];
    for (const cfg of BENCHMARK_SUITE) {
      const raw = generateInstance(cfg.n, cfg.K, 4, cfg.density, cfg.seed);
      const instanceData = {
        n: cfg.n, K: cfg.K, d: 4,
        tasks: raw.tasks, conflicts: raw.conflicts,
        capacities: raw.capacities,
        resources: raw.resources,
        windows: raw.windows,
        weights: raw.weights,
      };

      const start = Date.now();
      const result = runScheduler(instanceData, algorithm);
      const runtimeMs = Date.now() - start;

      // Empirical ratio: for small instances, compare this algo vs greedy baseline
      let empiricalRatio = null;
      if (cfg.category === 'small' && result.feasible && result.penalty > 0) {
        try {
          const greedyResult = runScheduler(instanceData, 'priority-greedy');
          if (greedyResult.feasible && greedyResult.penalty > 0) {
            const ratio = result.penalty / greedyResult.penalty;
            empiricalRatio = isFinite(ratio) ? parseFloat(ratio.toFixed(3)) : null;
          }
        } catch (_) {
          empiricalRatio = null;
        }
      }

      runs.push({
        n: cfg.n, K: cfg.K, density: cfg.density, seed: cfg.seed,
        algorithm,
        penalty: result.feasible ? (result.penalty ?? null) : null,
        runtimeMs,
        feasible: result.feasible,
        empiricalRatio,
      });
    }

    benchmark.runs = runs;
    benchmark.status = 'completed';
    await benchmark.save();

    res.status(201).json({ success: true, data: benchmark });
  } catch (err) {
    next(err);
  }
};

// GET /api/benchmarks
exports.getBenchmarks = async (req, res, next) => {
  try {
    const benchmarks = await Benchmark.find({ createdBy: req.user._id }).sort('-createdAt').limit(20);
    res.json({ success: true, data: benchmarks });
  } catch (err) { next(err); }
};

// GET /api/benchmarks/:id
exports.getBenchmark = async (req, res, next) => {
  try {
    const benchmark = await Benchmark.findById(req.params.id);
    if (!benchmark) return res.status(404).json({ success: false, message: 'Benchmark not found' });
    res.json({ success: true, data: benchmark });
  } catch (err) { next(err); }
};

exports.getSuite = (req, res) => {
  res.json({ success: true, data: BENCHMARK_SUITE });
};
