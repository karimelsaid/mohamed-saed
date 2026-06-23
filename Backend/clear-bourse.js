const mongoose = require('mongoose');

// THE WORKING URI FROM YOUR SERVER CONFIG
const MONGO_URI = "mongodb+srv://karimmohamed2729_db_user:mhQ9llpLLfeoOpn6@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

const bourseOfferSchema = new mongoose.Schema({
    date: String,
    slotIndex: Number,
    startTime: Date,
    endTime: Date,
    books: Array,
    status: String
});

const BourseOffer = mongoose.model('BourseOffer', bourseOfferSchema);

async function clearBourse() {
    try {
        console.log('--- Bourse Purge Initiated (Using Server Config) ---');
        
        // Using the same options as your working backend for stability
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 60000,
            connectTimeoutMS: 60000,
            family: 4 // FORCING IPv4 TO FIX DNS ERROR
        });
        
        console.log('✅ Connected successfully to production database!');

        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const datesToClear = [
            yesterday.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            tomorrow.toISOString().split('T')[0],
            '2026-04-14',
            '2026-04-15'
        ];

        console.log('Purging dates:', datesToClear);

        const result = await BourseOffer.deleteMany({ date: { $in: datesToClear } });
        console.log(`🗑️ Successfully deleted ${result.deletedCount} old entries.`);

        console.log('--- Purge Complete ---');
        console.log('ACTION: Refresh your browser on the Promotions page.');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Critical Error:', error.message);
        process.exit(1);
    }
}

clearBourse();
