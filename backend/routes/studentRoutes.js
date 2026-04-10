const express = require('express');
const { protect } = require('../middleware/auth');
const Batch = require('../models/Batch');
const FeeRecord = require('../models/FeeRecord');
const BatchRequest = require('../models/BatchRequest');

const router = express.Router();

// Validates student is approved
const approvedOnly = async (req, res, next) => {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (user.role === 'student' && !user.isApproved) {
        return res.status(403).json({ message: 'Pending teacher approval' });
    }
    next();
};

// Get batches the student is part of
router.get('/batches', protect, approvedOnly, async (req, res) => {
    try {
        const batches = await Batch.find({ students: req.user.id }).populate('teacher', 'name email').lean();
        res.json(batches);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user fee records
router.get('/fees', protect, approvedOnly, async (req, res) => {
    try {
        const fees = await FeeRecord.find({ student: req.user.id }).populate('batch', 'name').lean();
        res.json(fees.filter(f => f.batch !== null));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get student notifications
router.get('/notifications', protect, approvedOnly, async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get available batches to join (Upcoming or Ongoing)
router.get('/available-batches', protect, approvedOnly, async (req, res) => {
    try {
        // Find batches where student is not already enrolled
        // and status is 'Upcoming' or 'Ongoing'
        const batches = await Batch.find({
            status: { $in: ['Upcoming', 'Ongoing'] },
            students: { $ne: req.user.id }
        }).populate('teacher', 'name subject profilePic').sort({ startDate: 1 }).lean();
        
        // Also fetch pending requests to not show them as available or at least indicate pending
        const pendingRequests = await BatchRequest.find({
            student: req.user.id,
            status: 'Pending'
        }).lean();
        
        const pendingBatchIds = pendingRequests.map(req => req.batch.toString());
        
        // Filter out batches that already have a pending request
        const availableBatches = batches.filter(
            batch => !pendingBatchIds.includes(batch._id.toString())
        );

        res.json(availableBatches);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Request to join a batch
router.post('/batch-requests', protect, approvedOnly, async (req, res) => {
    try {
        const { batchId } = req.body;
        
        // Check if a pending request already exists
        const existingRequest = await BatchRequest.findOne({
            student: req.user.id,
            batch: batchId,
            status: 'Pending'
        });
        
        if (existingRequest) {
            return res.status(400).json({ message: 'You have already requested to join this batch.' });
        }
        
        const newRequest = new BatchRequest({
            student: req.user.id,
            batch: batchId,
            status: 'Pending'
        });
        
        await newRequest.save();
        res.status(201).json({ message: 'Request sent to SuperAdmin' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
