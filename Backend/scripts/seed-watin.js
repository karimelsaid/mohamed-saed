/**
 * Seed script: Populates initial Watin data (Categories, Speakers, Lectures, Daily Verses)
 * Run: node scripts/seed-watin.js
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const WatinCategory = require('../models/WatinCategory.model');
const WatinSpeaker = require('../models/WatinSpeaker.model');
const WatinLecture = require('../models/WatinLecture.model');
const WatinDailyVerse = require('../models/WatinDailyVerse.model');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb+srv://kenouz_user:nuwRkmwJospZXapy@cluster0.dkmw5bs.mongodb.net/kenouz?retryWrites=true&w=majority&appName=Cluster0";

async function seed() {
  console.log('🌱 [Watin Seed] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected!');

  // ====== Categories ======
  const categoriesData = [
    { slug: 'quran', name: { ar: 'القرآن الكريم', en: 'Quran' }, description: { ar: 'حفظ • تدبر • مراجعة' }, icon: 'fas fa-book-open', bgColor: 'rgba(31, 58, 46, 0.1)', iconColor: '#1F3A2E', sortOrder: 1, status: 'published' },
    { slug: 'qiraat', name: { ar: 'القراءات والأسانيد', en: 'Qiraat' }, description: { ar: 'دروس • أسانيد • تدريب' }, icon: 'fas fa-microphone-alt', bgColor: 'rgba(107, 125, 92, 0.12)', iconColor: '#6B7D5C', sortOrder: 2, status: 'published' },
    { slug: 'tafsir', name: { ar: 'التفسير وعلوم القرآن', en: 'Tafsir' }, description: { ar: 'تفسير • مناسبات • ناسخ ومنسوخ' }, icon: 'fas fa-quran', bgColor: 'rgba(168, 149, 114, 0.12)', iconColor: '#A89572', sortOrder: 3, status: 'published' },
    { slug: 'sharia', name: { ar: 'العلوم الشرعية', en: 'Islamic Sciences' }, description: { ar: 'عقيدة • حديث • سيرة' }, icon: 'fas fa-mosque', bgColor: 'rgba(79, 122, 90, 0.12)', iconColor: '#4F7A5A', sortOrder: 4, status: 'published' },
    { slug: 'fiqh', name: { ar: 'الفقه والأصول', en: 'Fiqh' }, description: { ar: 'فقه • أصول الفقه • قواعد فقهية' }, icon: 'fas fa-balance-scale', bgColor: 'rgba(31, 58, 46, 0.08)', iconColor: '#1F3A2E', sortOrder: 5, status: 'published' },
    { slug: 'arabic', name: { ar: 'اللغة العربية', en: 'Arabic Language' }, description: { ar: 'نحو • صرف • بلاغة' }, icon: 'fas fa-language', bgColor: 'rgba(110, 124, 112, 0.12)', iconColor: '#6E7C70', sortOrder: 6, status: 'published' },
  ];

  console.log('📂 Seeding categories...');
  const categories = {};
  for (const cat of categoriesData) {
    const existing = await WatinCategory.findOne({ slug: cat.slug });
    if (existing) {
      categories[cat.slug] = existing;
      console.log(`  ⏭️  Category "${cat.slug}" already exists, skipping`);
    } else {
      categories[cat.slug] = await WatinCategory.create(cat);
      console.log(`  ✅ Created category: ${cat.name.ar}`);
    }
  }

  // ====== Speakers ======
  const speakersData = [
    { slug: 'ahmed-abdulaziz', name: { ar: 'أحمد عبد العزيز', en: 'Ahmed Abdulaziz' }, title: 'الشيخ', status: 'published' },
    { slug: 'mohammed-hassan', name: { ar: 'محمد حسن', en: 'Mohammed Hassan' }, title: 'د.', status: 'published' },
    { slug: 'ahmed-zidan', name: { ar: 'أحمد زيدان', en: 'Ahmed Zidan' }, title: 'الشيخ', status: 'published' },
    { slug: 'saeed-mahmoud', name: { ar: 'سعيد محمود', en: 'Saeed Mahmoud' }, title: 'الشيخ', status: 'published' },
    { slug: 'omar-soliman', name: { ar: 'عمر سليمان', en: 'Omar Soliman' }, title: 'د.', status: 'published' },
  ];

  console.log('👤 Seeding speakers...');
  const speakers = {};
  for (const sp of speakersData) {
    const existing = await WatinSpeaker.findOne({ slug: sp.slug });
    if (existing) {
      speakers[sp.slug] = existing;
      console.log(`  ⏭️  Speaker "${sp.slug}" already exists, skipping`);
    } else {
      speakers[sp.slug] = await WatinSpeaker.create(sp);
      console.log(`  ✅ Created speaker: ${sp.name.ar}`);
    }
  }

  // ====== Lectures ======
  const lecturesData = [
    {
      slug: 'sharh-shatibiyya-01',
      title: 'شرح منظومة الشاطبية - الدرس الأول',
      description: 'الدرس الأول من سلسلة شرح منظومة الشاطبية في القراءات السبع',
      speakerId: speakers['ahmed-abdulaziz']._id,
      categoryIds: [categories['qiraat']._id],
      primaryCategoryId: categories['qiraat']._id,
      tags: ['القراءات', 'الشاطبية'],
      series: { name: 'شرح الشاطبية', order: 1 },
      audio: { durationSec: 2720 },
      transcription: { status: 'completed', totalSegments: 45, quranSegments: 12 },
      status: 'published',
      publishedAt: new Date('2026-09-28')
    },
    {
      slug: 'usul-tafsir-intro',
      title: 'مقدمة في أصول التفسير',
      description: 'مقدمة شاملة في أصول التفسير وقواعده',
      speakerId: speakers['mohammed-hassan']._id,
      categoryIds: [categories['tafsir']._id],
      primaryCategoryId: categories['tafsir']._id,
      tags: ['التفسير', 'أصول'],
      audio: { durationSec: 1510 },
      transcription: { status: 'not_requested' },
      status: 'published',
      publishedAt: new Date('2026-09-30')
    },
    {
      slug: 'ajrumiyya-irab',
      title: 'شرح الآجرومية - باب الإعراب',
      description: 'شرح مفصل لباب الإعراب من متن الآجرومية',
      speakerId: speakers['ahmed-zidan']._id,
      categoryIds: [categories['arabic']._id],
      primaryCategoryId: categories['arabic']._id,
      tags: ['اللغة العربية', 'النحو', 'الآجرومية'],
      series: { name: 'شرح الآجرومية', order: 3 },
      audio: { durationSec: 2045 },
      transcription: { status: 'processing', progress: 35 },
      status: 'published',
      publishedAt: new Date('2026-10-01')
    },
    {
      slug: 'madd-tabii',
      title: 'أحكام المد الطبيعي',
      description: 'درس في أحكام المد الطبيعي والفرعي',
      speakerId: speakers['saeed-mahmoud']._id,
      categoryIds: [categories['qiraat']._id, categories['quran']._id],
      primaryCategoryId: categories['qiraat']._id,
      tags: ['القراءات', 'التجويد', 'المد'],
      audio: { durationSec: 1110 },
      transcription: { status: 'completed', totalSegments: 22, quranSegments: 8 },
      status: 'published',
      publishedAt: new Date('2026-09-25')
    },
    {
      slug: 'salat-jumaa',
      title: 'باب صلاة الجمعة',
      description: 'شرح أحكام صلاة الجمعة من كتاب الفقه',
      speakerId: speakers['omar-soliman']._id,
      categoryIds: [categories['fiqh']._id],
      primaryCategoryId: categories['fiqh']._id,
      tags: ['الفقه', 'الصلاة'],
      audio: { durationSec: 3135 },
      transcription: { status: 'not_requested' },
      status: 'published',
      publishedAt: new Date('2026-09-20')
    }
  ];

  console.log('🎙️  Seeding lectures...');
  for (const lec of lecturesData) {
    const existing = await WatinLecture.findOne({ slug: lec.slug });
    if (existing) {
      console.log(`  ⏭️  Lecture "${lec.slug}" already exists, skipping`);
    } else {
      await WatinLecture.create(lec);
      console.log(`  ✅ Created lecture: ${lec.title}`);
    }
  }

  // ====== Daily Verses (Evergreen Pool) ======
  const versesData = [
    { surah: 11, surahName: 'هود', ayahFrom: 88, ayahTo: 88, text: '﴿ وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ ۚ عَلَيْهِ تَوَكَّلْتُ وَإِلَيْهِ أُنِيبُ ﴾', reflection: 'التوكل على الله تعالى والإنابة إليه', isEvergreen: true, status: 'published' },
    { surah: 2, surahName: 'البقرة', ayahFrom: 286, ayahTo: 286, text: '﴿ لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا ﴾', reflection: 'رحمة الله بعباده في التكليف', isEvergreen: true, status: 'published' },
    { surah: 94, surahName: 'الشرح', ayahFrom: 5, ayahTo: 6, text: '﴿ فَإِنَّ مَعَ الْعُسْرِ يُسْرًا • إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾', reflection: 'بشارة بأن الفرج قريب مع كل عسر', isEvergreen: true, status: 'published' },
    { surah: 3, surahName: 'آل عمران', ayahFrom: 139, ayahTo: 139, text: '﴿ وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ ﴾', reflection: 'تثبيت القلوب والعزائم', isEvergreen: true, status: 'published' },
    { surah: 65, surahName: 'الطلاق', ayahFrom: 3, ayahTo: 3, text: '﴿ وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ﴾', reflection: 'الله كافي من توكل عليه', isEvergreen: true, status: 'published' },
    { surah: 29, surahName: 'العنكبوت', ayahFrom: 69, ayahTo: 69, text: '﴿ وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا ﴾', reflection: 'ثمرة المجاهدة في سبيل الله', isEvergreen: true, status: 'published' },
    { surah: 39, surahName: 'الزمر', ayahFrom: 53, ayahTo: 53, text: '﴿ قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ﴾', reflection: 'باب التوبة مفتوح دائماً', isEvergreen: true, status: 'published' },
  ];

  console.log('📖 Seeding daily verses...');
  const existingVerses = await WatinDailyVerse.countDocuments();
  if (existingVerses === 0) {
    for (const v of versesData) {
      await WatinDailyVerse.create(v);
      console.log(`  ✅ Created verse: سورة ${v.surahName}`);
    }
  } else {
    console.log(`  ⏭️  ${existingVerses} verses already exist, skipping`);
  }

  // Update lecture counts on categories
  console.log('🔄 Updating category lecture counts...');
  const allCats = await WatinCategory.find();
  for (const cat of allCats) {
    const count = await WatinLecture.countDocuments({ categoryIds: cat._id, status: 'published' });
    await WatinCategory.updateOne({ _id: cat._id }, { lectureCount: count });
    console.log(`  ✅ ${cat.name.ar}: ${count} lectures`);
  }

  // Update speaker lecture counts
  console.log('🔄 Updating speaker lecture counts...');
  const allSpeakers = await WatinSpeaker.find();
  for (const sp of allSpeakers) {
    const count = await WatinLecture.countDocuments({ speakerId: sp._id, status: 'published' });
    await WatinSpeaker.updateOne({ _id: sp._id }, { lectureCount: count });
    console.log(`  ✅ ${sp.name.ar}: ${count} lectures`);
  }

  console.log('\n🎉 [Watin Seed] Done! All data seeded successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed error:', err);
  process.exit(1);
});
