const Instance = require('../models/Instance');
const { generateInstance } = require('../utils/instanceGenerator');

// GET /api/instances
exports.getInstances = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { createdBy: req.user._id };
    if (status) filter.status = status;

    const [instances, total] = await Promise.all([
      Instance.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(+limit),
      Instance.countDocuments(filter),
    ]);

    res.json({ success: true, data: instances, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// GET /api/instances/:id
exports.getInstance = async (req, res, next) => {
  try {
    const instance = await Instance.findById(req.params.id);
    if (!instance) return res.status(404).json({ success: false, message: 'Instance not found' });
    res.json({ success: true, data: instance });
  } catch (err) { next(err); }
};

// POST /api/instances/generate
exports.generateInstanceRoute = async (req, res, next) => {
  try {
    const { n, K, conflictDensity = 0.3, seed = 42, name, description } = req.body;
    if (!n || !K) return res.status(400).json({ success: false, message: 'n and K are required' });

    const generated = generateInstance(n, K, 4, conflictDensity, seed);

    const instance = await Instance.create({
      name: name || `Instance n=${n} K=${K} seed=${seed}`,
      description,
      n, K, d: 4, seed, conflictDensity,
      tasks: generated.tasks,
      conflicts: generated.conflicts,
      capacities: generated.capacities,
      resources: generated.resources,
      windows: generated.windows,
      weights: generated.weights,
      status: 'ready',
      createdBy: req.user._id,
      generatedBy: 'auto-generator',
    });

    res.status(201).json({ success: true, data: { instance, rawData: generated } });
  } catch (err) { next(err); }
};

// POST /api/instances
exports.createInstance = async (req, res, next) => {
  try {
    const instance = await Instance.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: instance });
  } catch (err) { next(err); }
};

// PUT /api/instances/:id
exports.updateInstance = async (req, res, next) => {
  try {
    const instance = await Instance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!instance) return res.status(404).json({ success: false, message: 'Instance not found' });
    res.json({ success: true, data: instance });
  } catch (err) { next(err); }
};

// DELETE /api/instances/:id
exports.deleteInstance = async (req, res, next) => {
  try {
    const instance = await Instance.findByIdAndDelete(req.params.id);
    if (!instance) return res.status(404).json({ success: false, message: 'Instance not found' });
    res.json({ success: true, message: 'Instance deleted' });
  } catch (err) { next(err); }
};
