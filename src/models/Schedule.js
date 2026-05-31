const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  instanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instance',
    required: true,
  },
  algorithm: {
    type: String,
    enum: ['priority-greedy', 'dsatur', 'simulated-annealing', 'tabu-search'],
    required: true,
  },
  feasible: { type: Boolean, required: true },
  violationReason: { type: String },
  assignment: { type: mongoose.Schema.Types.Mixed }, // array [slotIndex per task] or object
  penalty: { type: Number },
  runtimeMs: { type: Number },
  slotUtilization: [[{ type: Number }]], // K x d utilization matrix
  penaltyBreakdown: {
    delayPenalty: Number,
    loadImbalancePenalty: Number,
    slaRiskPenalty: Number,
    gpuFragmentationPenalty: Number,
    total: Number,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
