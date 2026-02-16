const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    if (!/already exists/.test(error.message)) {
        console.error('❌ Firebase Admin Initialization Error:', error.stack);
    }
}

module.exports = admin;
