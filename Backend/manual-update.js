const mongoose = require('mongoose');
const Ebook = require('./models/Ebook.model');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });
const MONGO_URI = 'mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz';

async function updateDopamine() {
    await mongoose.connect(MONGO_URI);
    const book = await Ebook.findOne({ title: { $regex: 'الدوبامين' } });

    if (book) {
        console.log('Updating book:', book.title);
        book.author = "د. آنا ليمبكي";
        book.pages = 250;
        book.description = book.description || "كتاب يتحدث عن الإدمان والبحث عن المتعة في عالمنا المعاصر.";

        await book.save();
        console.log('Updated successfully!');
    } else {
        console.log('Book not found');
    }
    process.exit();
}
updateDopamine();
