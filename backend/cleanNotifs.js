const mongoose = require('mongoose');
require('dotenv').config();
const Notification = require('./models/Notification');

async function clean() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://student:student123@cluster0.cbzqigh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
    console.log("Connected");
    const res = await Notification.deleteMany({ message: { $regex: /b2/i } });
    console.log("Deleted count:", res.deletedCount);
    process.exit(0);
}
clean();
