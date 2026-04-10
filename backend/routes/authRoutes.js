const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { uploadBase64 } = require('../utils/cloudinary');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts from this IP, please try again after 15 minutes' }
});

router.use('/login', authLimiter);
router.use('/register', authLimiter);

const validatePasswordStrong = (pwd) => {
    if (!pwd || pwd.length < 8) return false;
    if (!/[a-zA-Z]/.test(pwd)) return false;
    if (!/[0-9]/.test(pwd)) return false;
    if (!/[^a-zA-Z0-9]/.test(pwd)) return false;
    return true;
};

// Register a new student
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, phone, address, profilePic, tenthMarks, twelfthMarks, tenthMarksheet, twelfthMarksheet } = req.body;

        if (role !== 'student') {
            return res.status(400).json({ message: 'Only students can register directly. Teachers must be added by SuperAdmin.' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        if (!validatePasswordStrong(password)) {
            return res.status(400).json({ message: 'Password is too weak. Must be at least 8 chars, alphanumeric with a special symbol.' });
        }

        if (!email.endsWith('@gmail.com')) {
            return res.status(400).json({ message: 'Only @gmail.com email addresses are allowed.' });
        }
        
        if (!phone || phone.length !== 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ message: 'Phone number must be exactly 10 digits.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        let profilePicUrl = null;
        let tenthMarksheetUrl = null;
        let twelfthMarksheetUrl = null;

        if (profilePic) profilePicUrl = await uploadBase64(profilePic, 'profiles');
        if (tenthMarksheet) tenthMarksheetUrl = await uploadBase64(tenthMarksheet, 'documents');
        if (twelfthMarksheet) twelfthMarksheetUrl = await uploadBase64(twelfthMarksheet, 'documents');

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            phone,
            address,
            isApproved: false, // Students need approval
            admissionDate: new Date(),
            profilePic: profilePicUrl,
            tenthMarks,
            twelfthMarks,
            tenthMarksheet: tenthMarksheetUrl,
            twelfthMarksheet: twelfthMarksheetUrl
        });

        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.role === 'student' && !user.isApproved) {
            return res.status(403).json({ message: 'Admission pending approval by teacher' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({ token, user: { id: user._id, name: user.name, role: user.role, email: user.email, profilePic: user.profilePic } });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get user profile details
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update password
router.put('/profile/password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        if (!validatePasswordStrong(newPassword)) {
            return res.status(400).json({ message: 'New password is too weak. Must be at least 8 chars, alphanumeric with a special symbol.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update profile picture
router.put('/profile/picture', protect, async (req, res) => {
    try {
        const { profilePic } = req.body;
        if (!profilePic) {
            return res.status(400).json({ message: 'No image provided' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const profilePicUrl = await uploadBase64(profilePic, 'profiles');
        user.profilePic = profilePicUrl;
        await user.save();

        res.json({ message: 'Profile picture updated successfully', profilePic: user.profilePic });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Save Expo Push Token
router.put('/push-token', protect, async (req, res) => {
    try {
        const { token } = req.body;
        await User.findByIdAndUpdate(req.user.id, { expoPushToken: token });
        res.json({ message: 'Push token updated' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
