const mongoose = require('mongoose');

const instanceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Instance name is required'],
    trim: true,
  },
  description: { type: String, trim: true },
  n: { type: Number, required: true, min: 1 },      // number of tasks
  K: { type: Number, required: true, min: 1 },      // number of slots
  d: { type: Number, default: 4 },                  // resource dimensions
  seed: { type: Number, default: 42 },
  conflictDensity: { type: Number, default: 0.3, min: 0, max: 1 },
  tasks: [{ type: String }],                         // task IDs  ["T0","T1",...]
  conflicts: [[{ type: Number }]],                   // edge list [[i,j],...]
  capacities: [[{ type: Number }]],                  // K x d capacity matrix
  resources: [[{ type: Number }]],                   // n x d resource matrix
  windows: [[{ type: Number }]],                     // n x 2 SLA windows [[lo,hi],...]
  weights: [{ type: Number }],                       // n weights
  status: {
    type: String,
    enum: ['draft', 'ready', 'scheduled', 'archived'],
    default: 'draft',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  generatedBy: {
    type: String,
    enum: ['manual', 'auto-generator'],
    default: 'manual',
  },
}, { timestamps: true });

module.exports = mongoose.model('Instance', instanceSchema);
