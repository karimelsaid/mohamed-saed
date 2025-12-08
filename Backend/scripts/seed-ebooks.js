/**
 * Script to seed test ebooks into the database
 * Run with: node scripts/seed-ebooks.js
 */

require('../loadEnv');
const mongoose = require('mongoose');
const Ebook = require('../models/Ebook.model');
const { connectDB } = require('../config/database');

const testEbooks = [
    {
        title: 'أساسيات البرمجة',
        author: 'أحمد محمد',
        description: 'كتاب شامل يتناول أساسيات البرمجة للمبتدئين بأسلوب سهل ومبسط',
        coverImage: 'https://via.placeholder.com/300x400?text=Programming',
        epubFilePath: 'test-book-1.epub',
        fileSize: 2500000,
        category: 'Education-children',
        language: 'ar',
        publisher: 'دار كنوز للنشر',
        publishYear: 2024,
        pages: 250,
        price: 50,
        availableForSubscription: true,
        status: 'active'
    },
    {
        title: 'فن الإدارة الحديثة',
        author: 'سارة أحمد',
        description: 'دليل عملي للإدارة الفعالة في عصر التحول الرقمي',
        coverImage: 'https://via.placeholder.com/300x400?text=Management',
        epubFilePath: 'test-book-2.epub',
        fileSize: 3200000,
        category: 'Business-Marketing-Finance',
        language: 'ar',
        publisher: 'دار كنوز للنشر',
        publishYear: 2024,
        pages: 320,
        price: 75,
        availableForSubscription: true,
        status: 'active'
    },
    {
        title: 'رحلة في التاريخ العربي',
        author: 'محمد علي',
        description: 'رحلة شيقة عبر تاريخ الحضارة العربية والإسلامية',
        coverImage: 'https://via.placeholder.com/300x400?text=History',
        epubFilePath: 'test-book-3.epub',
        fileSize: 4100000,
        category: 'History-Biographies',
        language: 'ar',
        publisher: 'دار كنوز للنشر',
        publishYear: 2023,
        pages: 420,
        price: 90,
        availableForSubscription: true,
        status: 'active'
    },
    {
        title: 'قصص من القرآن',
        author: 'عبد الله حسن',
        description: 'قصص الأنبياء والصالحين من القرآن الكريم بأسلوب سهل',
        coverImage: 'https://via.placeholder.com/300x400?text=Islamic',
        epubFilePath: 'test-book-4.epub',
        fileSize: 1800000,
        category: 'Islamic',
        language: 'ar',
        publisher: 'دار كنوز للنشر',
        publishYear: 2024,
        pages: 180,
        price: 40,
        availableForSubscription: true,
        status: 'active'
    },
    {
        title: 'تطوير الذات',
        author: 'نور الدين',
        description: 'كتاب عملي لتحسين حياتك وتحقيق أهدافك',
        coverImage: 'https://via.placeholder.com/300x400?text=Self-Dev',
        epubFilePath: 'test-book-5.epub',
        fileSize: 2100000,
        category: 'Self-development-psychology',
        language: 'ar',
        publisher: 'دار كنوز للنشر',
        publishYear: 2024,
        pages: 210,
        price: 55,
        availableForSubscription: true,
        status: 'active'
    }
];

async function seedEbooks() {
    try {
        await connectDB();
        console.log('Connected to database');

        // Check if ebooks already exist
        const existingCount = await Ebook.countDocuments();
        if (existingCount > 0) {
            console.log(`Found ${existingCount} existing ebooks. Skipping seed.`);
            process.exit(0);
        }

        // Insert test ebooks
        const result = await Ebook.insertMany(testEbooks);
        console.log(`Successfully inserted ${result.length} test ebooks`);

        process.exit(0);
    } catch (error) {
        console.error('Error seeding ebooks:', error);
        process.exit(1);
    }
}

seedEbooks();
