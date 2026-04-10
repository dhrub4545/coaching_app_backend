const express = require('express');
const { protect, superAdminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Batch = require('../models/Batch');
const FeeRecord = require('../models/FeeRecord');
const BatchRequest = require('../models/BatchRequest');
const bcrypt = require('bcrypt');
const { sendPushNotification } = require('../utils/pushHelper');

const Counter = require('../models/Counter');

const router = express.Router();

const validatePasswordStrong = (pwd) => {
    if (!pwd || pwd.length < 8) return false;
    if (!/[a-zA-Z]/.test(pwd)) return false;
    if (!/[0-9]/.test(pwd)) return false;
    if (!/[^a-zA-Z0-9]/.test(pwd)) return false;
    return true;
};

const generateSequentialId = async (prefix, counterName) => {
    const sequenceDocument = await Counter.findByIdAndUpdate(
        counterName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return prefix + String(sequenceDocument.seq).padStart(6, '0');
};

// Get all teachers
router.get('/teachers', protect, superAdminOnly, async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('-password -expoPushToken').lean();
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add a teacher
router.post('/teacher', protect, superAdminOnly, async (req, res) => {
    try {
        const { name, email, password, phone, address, subject } = req.body;
        
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        if (!validatePasswordStrong(password)) {
            return res.status(400).json({ message: 'Password is too weak. Must be at least 8 chars, alphanumeric with a special symbol.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newTeacher = new User({
            name, email, password: hashedPassword, role: 'teacher', phone, address, subject,
            isApproved: true,
            userId: await generateSequentialId('TE', 'teacherId')
        });
        await newTeacher.save();
        res.status(201).json({ message: 'Teacher created successfully', teacher: newTeacher });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all students
router.get('/students', protect, superAdminOnly, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }).select('-password -expoPushToken').lean();
        res.json(students);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a user
router.delete('/user/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Approve student
router.put('/approve/:studentId', protect, superAdminOnly, async (req, res) => {
    try {
        const student = await User.findById(req.params.studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });
        
        student.isApproved = true;
        if (!student.userId) {
            student.userId = await generateSequentialId('ST', 'studentId');
        }
        await student.save();
        res.json({ message: 'Student approved', student });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Unapprove student
router.put('/unapprove/:studentId', protect, superAdminOnly, async (req, res) => {
    try {
        const student = await User.findById(req.params.studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });
        student.isApproved = false;
        await student.save();
        res.json({ message: 'Student unapproved', student });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new batch
router.post('/batches', protect, superAdminOnly, async (req, res) => {
    try {
        const { name, subject, scheduleTime, teacherId, monthlyFee, startDate, closeDate } = req.body;
        
        // Lookup teacher by userId (e.g. TE-000001) instead of Mongo _id
        const teacherObj = await User.findOne({ userId: teacherId, role: 'teacher' });
        if (!teacherObj) return res.status(404).json({ message: 'Teacher ID not found' });
        
        const sd = new Date(startDate || Date.now());
        const today = new Date();
        today.setHours(0,0,0,0);
        const status = sd > today ? 'Upcoming' : 'Ongoing';

        const newBatch = new Batch({
            name, subject, scheduleTime, teacher: teacherObj._id, monthlyFee: monthlyFee || 0,
            startDate: sd, closeDate: closeDate ? new Date(closeDate) : null,
            status
        });
        await newBatch.save();
        res.status(201).json(newBatch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Edit batch details
router.put('/batches/:batchId', protect, superAdminOnly, async (req, res) => {
    try {
        const { name, subject, scheduleTime, teacherId, monthlyFee, startDate, closeDate } = req.body;
        
        const updateData = {};
        if (name) updateData.name = name;
        if (subject) updateData.subject = subject;
        if (scheduleTime) updateData.scheduleTime = scheduleTime;
        if (monthlyFee !== undefined) updateData.monthlyFee = monthlyFee;
        
        if (teacherId) {
            const teacherObj = await User.findOne({ userId: teacherId, role: 'teacher' });
            if (!teacherObj) return res.status(404).json({ message: 'Teacher ID not found' });
            updateData.teacher = teacherObj._id;
        }

        if (startDate) {
            const sd = new Date(startDate);
            updateData.startDate = sd;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            updateData.status = sd > today ? 'Upcoming' : 'Ongoing';
        }
        
        if (closeDate !== undefined) {
            updateData.closeDate = closeDate ? new Date(closeDate) : null;
        }

        const batch = await Batch.findByIdAndUpdate(req.params.batchId, updateData, { new: true });
        res.json(batch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update batch fee
router.put('/batches/:batchId/fee', protect, superAdminOnly, async (req, res) => {
    try {
        const { monthlyFee } = req.body;
        const batch = await Batch.findByIdAndUpdate(req.params.batchId, { monthlyFee }, { new: true });
        res.json(batch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Close/Complete batch
router.put('/batches/:batchId/complete', protect, superAdminOnly, async (req, res) => {
    try {
        const batch = await Batch.findByIdAndUpdate(req.params.batchId, { status: 'Completed' }, { new: true });
        res.json(batch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete batch
router.delete('/batches/:batchId', protect, superAdminOnly, async (req, res) => {
    try {
        const batch = await Batch.findByIdAndDelete(req.params.batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        
        // Delete all associated fee records
        await FeeRecord.deleteMany({ batch: req.params.batchId });
        
        // Delete related notifications
        const Notification = require('../models/Notification');
        await Notification.deleteMany({
            message: { $regex: new RegExp(`You joined ${batch.name}`, 'i') }
        });
        
        res.json({ message: 'Batch and associated fees deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Assign student to batch
router.put('/batches/:batchId/assign/:studentId', protect, superAdminOnly, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        
        if (!batch.students.includes(req.params.studentId)) {
            batch.students.push(req.params.studentId);
            await batch.save();
            
            // Generate the first initial fee for the student joining an active batch
            if (batch.status === 'Ongoing' && batch.monthlyFee > 0) {
                const initialFee = new FeeRecord({
                    student: req.params.studentId,
                    batch: batch._id,
                    amount: batch.monthlyFee,
                    dueDate: new Date(new Date().setDate(new Date().getDate() + 5)) // due 5 days after joining
                });
                await initialFee.save();
                
                // Also create Notification
                const Notification = require('../models/Notification');
                await Notification.create({
                    user: req.params.studentId,
                    title: 'Fee Started',
                    message: `You joined ${batch.name}. Your starting fee of ₹${batch.monthlyFee} is generated.`
                });
            }
        }
        res.json({ message: 'Student assigned to batch and initial fee generated', batch });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Remove student from batch
router.put('/batches/:batchId/remove/:studentId', protect, superAdminOnly, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        
        if (batch.students.includes(req.params.studentId)) {
            batch.students = batch.students.filter(studentId => studentId.toString() !== req.params.studentId);
            await batch.save();
        }
        res.json({ message: 'Student removed from batch', batch });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all batches
router.get('/batches', protect, superAdminOnly, async (req, res) => {
    try {
        const batches = await Batch.find({})
            .populate('teacher', 'name email userId')
            .populate('students', 'name email userId')
            .lean();
        res.json(batches);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// View all fee records
router.get('/fees', protect, superAdminOnly, async (req, res) => {
    try {
        const fees = await FeeRecord.find().populate('student', 'name email userId').populate('batch', 'name').lean();
        res.json(fees.filter(f => f.batch !== null));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update fee status (toggle between paid/unpaid)
router.put('/fees/:feeId/togglePayment', protect, superAdminOnly, async (req, res) => {
    try {
        const fee = await FeeRecord.findById(req.params.feeId);
        if (!fee) return res.status(404).json({ message: 'Fee record not found' });
        
        fee.isPaid = !fee.isPaid;
        fee.paidDate = fee.isPaid ? new Date() : null;
        await fee.save();

        // Send Push Notification
        const student = await User.findById(fee.student);
        if (student && student.expoPushToken) {
            const statusMsg = fee.isPaid ? 'has been marked as PAID' : 'has been marked as UNPAID (Due)';
            await sendPushNotification(student.expoPushToken, 
                'Fee Update', 
                `Your fee of ₹${fee.amount} ${statusMsg} by admin.`
            );
        }

        res.json({ message: fee.isPaid ? 'Fee marked as paid' : 'Fee marked as unpaid', fee });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all pending batch requests
router.get('/batch-requests', protect, superAdminOnly, async (req, res) => {
    try {
        const requests = await BatchRequest.find({ status: 'Pending' })
            .populate('student', '-password -expoPushToken')
            .populate('batch', 'name subject startDate status')
            .sort({ createdAt: -1 })
            .lean();
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Accept a batch request
router.put('/batch-requests/:id/accept', protect, superAdminOnly, async (req, res) => {
    try {
        const request = await BatchRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });
        
        request.status = 'Accepted';
        await request.save();
        
        const batch = await Batch.findById(request.batch);
        if (batch && !batch.students.includes(request.student)) {
            batch.students.push(request.student);
            await batch.save();
            
            // Generate the first initial fee for the student joining an active batch
            if (batch.status === 'Ongoing' && batch.monthlyFee > 0) {
                const initialFee = new FeeRecord({
                    student: request.student,
                    batch: batch._id,
                    amount: batch.monthlyFee,
                    dueDate: new Date(new Date().setDate(new Date().getDate() + 5)) // due 5 days after joining
                });
                await initialFee.save();
                
                // create Notification
                const Notification = require('../models/Notification');
                await Notification.create({
                    user: request.student,
                    title: 'Batch Request Accepted & Fee Started',
                    message: `You were added to ${batch.name}. Your starting fee of ₹${batch.monthlyFee} is generated.`
                });
            } else {
                const Notification = require('../models/Notification');
                await Notification.create({
                    user: request.student,
                    title: 'Batch Request Accepted',
                    message: `You were successfully added to ${batch.name}.`
                });
            }
        }
        res.json({ message: 'Request accepted and student assigned to batch', request });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject a batch request
router.put('/batch-requests/:id/reject', protect, superAdminOnly, async (req, res) => {
    try {
        const request = await BatchRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.status !== 'Pending') return res.status(400).json({ message: 'Request already processed' });
        
        request.status = 'Rejected';
        await request.save();
        
        const batch = await Batch.findById(request.batch);
        const Notification = require('../models/Notification');
        await Notification.create({
            user: request.student,
            title: 'Batch Request Rejected',
            message: `Your request to join ${batch ? batch.name : 'the batch'} was rejected.`
        });
        
        res.json({ message: 'Request rejected', request });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
