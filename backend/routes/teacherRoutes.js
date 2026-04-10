const express = require('express');
const { protect, teacherOnly } = require('../middleware/auth');
const User = require('../models/User');
const Batch = require('../models/Batch');
const FeeRecord = require('../models/FeeRecord');
const Counter = require('../models/Counter');

const router = express.Router();

const generateSequentialId = async (prefix, counterName) => {
    const sequenceDocument = await Counter.findByIdAndUpdate(
        counterName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return prefix + String(sequenceDocument.seq).padStart(6, '0');
};

// Get all students (for teacher to view and assign)
router.get('/students', protect, teacherOnly, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }).select('-password -expoPushToken').lean();
        res.json(students);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});



// Get batches created by the teacher
router.get('/batches', protect, teacherOnly, async (req, res) => {
    try {
        const batches = await Batch.find({ teacher: req.user.id }).populate('students', 'name email userId').lean();
        res.json(batches);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// The POST /batches is removed here. It's only in superAdminRoutes now.





// View all fee records
router.get('/fees', protect, teacherOnly, async (req, res) => {
    try {
        const fees = await FeeRecord.find().populate('student', 'name email userId').populate('batch', 'name').lean();
        res.json(fees.filter(f => f.batch !== null));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});



module.exports = router;
