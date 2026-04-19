const net = require('net');

const hosts = [
    { ip: '34.22.84.143', name: 'Shard 00-00 (Belgium)' },
    { ip: '34.77.40.237', name: 'Shard 00-01 (Belgium)' },
    { ip: '35.205.216.54', name: 'Shard 00-02 (Belgium)' }
];


console.log('🚀 بدء فحص المنافذ لخوادم Atlas...');

hosts.forEach(host => {
    const socket = new net.Socket();
    const start = Date.now();

    socket.setTimeout(5000); // 5 ثواني مهلة

    socket.on('connect', () => {
        console.log(`✅ ${host.name} (${host.ip}): المنفذ 27017 مفتوح! (استغرق ${Date.now() - start}ms)`);
        socket.destroy();
    });

    socket.on('timeout', () => {
        console.log(`❌ ${host.name} (${host.ip}): انتهت المهلة (Timeout) - المنفذ مغلق غالباً.`);
        socket.destroy();
    });

    socket.on('error', (err) => {
        console.log(`❌ ${host.name} (${host.ip}): خطأ (${err.message})`);
    });

    socket.connect(27017, host.ip);
});
