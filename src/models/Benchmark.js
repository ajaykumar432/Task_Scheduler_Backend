const mongoose = require('mongoose');

const benchmarkSchema = new mongoose.Schema({
  name: { type: String, required: true },
  runs: [{
    n: Number,
    K: Number,
    density: Number,
    seed: Number,
    algorithm: String,
    penalty: Number,
    runtimeMs: Number,
    feasible: Boolean,
    empiricalRatio: { type: Number, default: null }, // vs brute force (small instances only)
  }],
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Benchmark', benchmarkSchema);
