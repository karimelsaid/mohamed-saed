// إعدادات اتصال MongoDB
const mongoose = require('mongoose');
const dns = require('dns');

const uri = process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";

// ===== حل مشكلة DNS =====
// محلل النظام (dns.lookup) يفشل في حل أسماء Atlas CNAME
// الحل: نتتبع سلسلة CNAME ونبني cache للعناوين

const dnsCache = new Map();
const originalLookup = dns.lookup.bind(dns);

// تتبع سلسلة CNAME حتى الوصول للـ IP
function followCnameChain(hostname) {
  return new Promise((resolve, reject) => {
    // أولاً: محاولة resolve4 مباشر
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        return resolve(addresses[0]);
      }
      // ثانياً: تتبع CNAME
      dns.resolveCname(hostname, (cnameErr, cnames) => {
        if (cnameErr || !cnames || cnames.length === 0) {
          // ثالثاً: محاولة استخراج IP من اسم EC2
          const ec2Match = hostname.match(/^ec2-(\d+)-(\d+)-(\d+)-(\d+)\./);
          if (ec2Match) {
            return resolve(`${ec2Match[1]}.${ec2Match[2]}.${ec2Match[3]}.${ec2Match[4]}`);
          }
          return reject(new Error(`Cannot resolve ${hostname}`));
        }
        // متابعة السلسلة
        followCnameChain(cnames[0]).then(resolve).catch(reject);
      });
    });
  });
}

// تعديل dns.lookup لاستخدام الـ cache عند فشل المحلل الأصلي
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // فحص الـ cache أولاً
  if (dnsCache.has(hostname)) {
    return callback(null, dnsCache.get(hostname), 4);
  }

  // محاولة المحلل الأصلي
  originalLookup(hostname, options, (err, address, family) => {
    if (!err) {
      return callback(null, address, family);
    }

    if (err.code === 'ENOTFOUND') {
      // محاولة حل عبر CNAME chain
      followCnameChain(hostname)
        .then(ip => {
          dnsCache.set(hostname, ip); // تخزين في الـ cache
          callback(null, ip, 4);
        })
        .catch(() => callback(err));
    } else {
      callback(err, address, family);
    }
  });
};

// ===== نهاية حل DNS =====

async function connectDB() {
  try {
    console.log('⏳ جاري الاتصال بـ MongoDB...');

    // حل أسماء الخوادم مسبقاً وتخزينها في الـ cache
    const shardHosts = [
      'ac-9kxn1oi-shard-00-00.oup4o7v.mongodb.net',
      'ac-9kxn1oi-shard-00-01.oup4o7v.mongodb.net',
      'ac-9kxn1oi-shard-00-02.oup4o7v.mongodb.net',
    ];
    
    for (const host of shardHosts) {
      try {
        const ip = await followCnameChain(host);
        dnsCache.set(host, ip);
        console.log(`🔗 DNS: ${host} → ${ip}`);
      } catch (e) {
        console.warn(`⚠️ DNS: فشل حل ${host}: ${e.message}`);
      }
    }

    // تحديث الـ cache كل 5 دقائق
    setInterval(async () => {
      for (const host of shardHosts) {
        try {
          const ip = await followCnameChain(host);
          dnsCache.set(host, ip);
        } catch (e) { /* تجاهل */ }
      }
    }, 5 * 60 * 1000);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 45000,
      maxPoolSize: 50,
      family: 4
    });
    console.log('✅ تم الاتصال بنجاح بـ MongoDB!');
    const connectionInfo = mongoose.connection.host;
    console.log(`🌐 متصل بـ: ${connectionInfo}`);
  } catch (err) {
    console.error('حدث خطأ في الاتصال بـ MongoDB:', err.message);
    console.error('تفاصيل الخطأ:', err);
    throw err;
  }
}

module.exports = { connectDB };
