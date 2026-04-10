const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g. "Morning Batch A"
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subject: { type: String },
    scheduleTime: { type: String },
    monthlyFee: { type: Number, default: 0 },
    startDate: { type: Date, required: true, default: Date.now, index: true },
    closeDate: { type: Date },
    status: { type: String, enum: ['Upcoming', 'Ongoing', 'Completed'], default: 'Ongoing', index: true }
}, { timestamps: true });

module.exports = mongoose.model('Batch', batchSchema);
