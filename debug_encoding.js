const fs = require('fs');
const path = require('path');

const filePath = 'd:\\My projects\\Kenouz\\public\\mushaf-data\\mushaf.txt';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0];
    console.log('First Line:', firstLine);

    let hexCodes = '';
    for (let i = 0; i < firstLine.length; i++) {
        hexCodes += firstLine.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0') + ' ';
    }
    console.log('Hex Codes:', hexCodes);
} catch (err) {
    console.error('Error reading file:', err);
}
