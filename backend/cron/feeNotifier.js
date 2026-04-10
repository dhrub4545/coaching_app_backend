const cron = require('node-cron');
const FeeRecord = require('../models/FeeRecord');
const Batch = require('../models/Batch');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/pushHelper');

// Run on the 1st of every month at 00:00 (0 0 1 * *)
const startCronJobs = () => {
    // One-time DB migration script (runs on start)
    Batch.updateMany({ status: 'Active' }, { status: 'Ongoing' })
        .then(res => res.modifiedCount > 0 && console.log(`Migrated ${res.modifiedCount} batches from Active to Ongoing`))
        .catch(console.error);

    // Run every midnight to check and transition Upcoming batches to Ongoing
    cron.schedule('0 0 * * *', async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // start of today
            
            // Find batches that are upcoming and start date is today or earlier
            const res = await Batch.updateMany(
                { status: 'Upcoming', startDate: { $lte: today } },
                { status: 'Ongoing' }
            );
            if (res.modifiedCount > 0) {
                console.log(`Transitioned ${res.modifiedCount} batches to Ongoing`);
            }
        } catch (error) {
            console.error('Error in transition cron:', error.message);
        }
    });

    cron.schedule('0 0 1 * *', async () => {
        console.log('Running monthly fee generation job...');
        try {
            // Find all ongoing batches
            const activeBatches = await Batch.find({ status: 'Ongoing' });
            
            for (let batch of activeBatches) {
                if (!batch.monthlyFee || batch.monthlyFee === 0) continue;
                
                for (let studentId of batch.students) {
                    // Create fee record for this month
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + 7); // Due by the 7th of the month
                    
                    const feeRecord = new FeeRecord({
                        student: studentId,
                        batch: batch._id,
                        amount: batch.monthlyFee,
                        dueDate: dueDate
                    });
                    await feeRecord.save();
                    
                    // Create Notification
                    await Notification.create({
                        user: studentId,
                        title: 'Monthly Fee Pending',
                        message: `Your fee for batch ${batch.name} of ₹${batch.monthlyFee} is now pending.`
                    });
                    
                    // Native Push Notification
                    const student = await User.findById(studentId);
                    if (student && student.expoPushToken) {
                        await sendPushNotification(student.expoPushToken, 
                            'Monthly Fee Pending', 
                            `Please pay the fee for ${batch.name}. Your due is ₹${batch.monthlyFee}`
                        );
                    }
                }
            }
            console.log('Monthly fee generation completed successfully.');
        } catch (error) {
            console.error('Error running fee cron job:', error.message);
        }
    });
};

module.exports = startCronJobs;
