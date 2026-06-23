const net = require('net');
const dns = require('dns');

console.log('🚀 بدء فحص المنافذ لخوادم Atlas ديناميكياً...');

dns.resolveSrv('_mongodb._tcp.cluster0.dkmw5bs.mongodb.net', (err, addresses) => {
    if (err) {
        console.error('❌ فشل استعلام سجلات SRV من DNS:', err.message);
        process.exit(1);
    }

    if (!addresses || addresses.length === 0) {
        console.error('❌ لم يتم العثور على أي خوادم (shards) في سجلات DNS.');
        process.exit(1);
    }

    console.log(`🔍 تم العثور على ${addresses.length} خوادم في سجل DNS، جاري جلب عناوين IP وفحص المنفذ 27017...`);

    addresses.forEach(addr => {
        dns.lookup(addr.name, (errLookup, ip) => {
            if (errLookup) {
                console.log(`❌ فشل تحديد IP للخادم ${addr.name}: ${errLookup.message}`);
                return;
            }

            const shortName = addr.name.split('.')[0];
            const socket = new net.Socket();
            const start = Date.now();

            socket.setTimeout(5000); // 5 ثواني مهلة

            socket.on('connect', () => {
                console.log(`✅ ${shortName} (${ip}): المنفذ 27017 مفتوح! (استغرق ${Date.now() - start}ms)`);
                socket.destroy();
            });

            socket.on('timeout', () => {
                console.log(`❌ ${shortName} (${ip}): انتهت المهلة (Timeout) - المنفذ مغلق غالباً أو الآي بي غير مضاف للـ Whitelist.`);
                socket.destroy();
            });

            socket.on('error', (errSocket) => {
                console.log(`❌ ${shortName} (${ip}): خطأ (${errSocket.message})`);
            });

            socket.connect(27017, ip);
        });
    });
});
