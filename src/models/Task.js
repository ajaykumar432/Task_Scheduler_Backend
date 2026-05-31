const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  name: {
    type: String,
    required: [true, 'Task name is required'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['OCR', 'Bureau Pull', 'GST Verify', 'Fraud Score', 'Credit Score', 'Document Check', 'Custom'],
    default: 'Custom',
  },
  resources: {
    cpu: { type: Number, required: true, min: 0 },   // CPU cores
    ram: { type: Number, required: true, min: 0 },   // RAM in GB
    gpu: { type: Number, required: true, min: 0 },   // GPU units
    network: { type: Number, required: true, min: 0 }, // Network Gbps
  },
  slaWindow: {
    lower: { type: Number, required: true, min: 0 },
    upper: { type: Number, required: true },
  },
  weight: {
    type: Number,
    required: true,
    min: 0.1,
    max: 10,
    default: 1,
  },
  description: { type: String, trim: true },
  instanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instance',
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
