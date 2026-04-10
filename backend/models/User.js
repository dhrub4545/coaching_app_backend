const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'teacher', 'student'], required: true, index: true },
    userId: { type: String, unique: true, sparse: true }, 
    subject: { type: String }, 
    
    phone: { type: String },
    address: { type: String },
    admissionDate: { type: Date, default: null },
    isApproved: { type: Boolean, default: false, index: true },
    profilePic: { type: String },
    expoPushToken: { type: String },
    tenthMarks: { type: String },
    twelfthMarks: { type: String },
    tenthMarksheet: { type: String },
    twelfthMarksheet: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
