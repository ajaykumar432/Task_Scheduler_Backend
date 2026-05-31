const Schedule = require('../models/Schedule');
const Instance = require('../models/Instance');
const { runScheduler } = require('../utils/scheduler');

// POST /api/scheduler/run
exports.runSchedule = async (req, res, next) => {
  try {
    const { instanceId, algorithm = 'priority-greedy' } = req.body;

    const instanceDoc = await Instance.findById(instanceId).lean();
    if (!instanceDoc) return res.status(404).json({ success: false, message: 'Instance not found' });

    // If older instance is missing resources/windows/weights, regenerate them from seed
    let instanceData = instanceDoc;
    if (!instanceDoc.resources || !instanceDoc.windows || !instanceDoc.weights ||
        instanceDoc.resources.length === 0 || instanceDoc.windows.length === 0) {
      const { generateInstance } = require('../utils/instanceGenerator');
      const generated = generateInstance(
        instanceDoc.n,
        instanceDoc.K,
        instanceDoc.d || 4,
        instanceDoc.conflictDensity || 0.3,
        instanceDoc.seed || 42
      );
      instanceData = {
        ...instanceDoc,
        resources: generated.resources,
        windows: generated.windows,
        weights: generated.weights,
        conflicts: instanceDoc.conflicts?.length ? instanceDoc.conflicts : generated.conflicts,
        capacities: instanceDoc.capacities?.length ? instanceDoc.capacities : generated.capacities,
      };
      // Persist the missing fields so we don't regenerate next time
      await Instance.findByIdAndUpdate(instanceId, {
        resources: instanceData.resources,
        windows: instanceData.windows,
        weights: instanceData.weights,
      });
    }

    const start = Date.now();
    const result = runScheduler(instanceData, algorithm);
    result.runtimeMs = Date.now() - start;

    // Convert assignment array [slotPerTask] → object { "T0": slot, "T1": slot, ... }
    // so it stores cleanly in MongoDB as Mixed
    let assignmentObj = null;
    if (result.assignment) {
      if (Array.isArray(result.assignment)) {
        assignmentObj = {};
        result.assignment.forEach((slot, i) => { assignmentObj[`T${i}`] = slot; });
      } else {
        assignmentObj = result.assignment;
      }
    }

    const schedule = await Schedule.create({
      instanceId,
      algorithm,
      feasible: result.feasible,
      violationReason: result.violationReason || null,
      assignment: assignmentObj,
      penalty: result.penalty ?? null,
      runtimeMs: result.runtimeMs,
      slotUtilization: result.slotUtilization || null,
      penaltyBreakdown: result.penaltyBreakdown || null,
      createdBy: req.user._id,
    });

    // Mark instance as scheduled
    if (result.feasible) {
      await Instance.findByIdAndUpdate(instanceId, { status: 'scheduled' });
    }

    res.status(201).json({ success: true, data: schedule });
  } catch (err) { next(err); }
};

// GET /api/scheduler/history/:instanceId
exports.getHistory = async (req, res, next) => {
  try {
    const schedules = await Schedule.find({ instanceId: req.params.instanceId })
      .sort('-createdAt').limit(20);
    res.json({ success: true, data: schedules });
  } catch (err) { next(err); }
};

// GET /api/scheduler/:id
exports.getSchedule = async (req, res, next) => {
  try {
    const schedule = await Schedule.findById(req.params.id).populate('instanceId');
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (err) { next(err); }
};

// GET /api/scheduler/stats/overview
exports.getStats = async (req, res, next) => {
  try {
    const [total, feasible, byAlgo] = await Promise.all([
      Schedule.countDocuments({ createdBy: req.user._id }),
      Schedule.countDocuments({ createdBy: req.user._id, feasible: true }),
      Schedule.aggregate([
        { $match: { createdBy: req.user._id } },
        { $group: { _id: '$algorithm', count: { $sum: 1 }, avgPenalty: { $avg: '$penalty' }, avgRuntime: { $avg: '$runtimeMs' } } },
      ]),
    ]);
    res.json({ success: true, data: { total, feasible, infeasible: total - feasible, byAlgo } });
  } catch (err) { next(err); }
};
