const mongoose = require('mongoose');

const feeRecordSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    isPaid: { type: Boolean, default: false, index: true },
    paidDate: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('FeeRecord', feeRecordSchema);
