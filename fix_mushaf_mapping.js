const fs = require('fs');
const path = require('path');

const inputFile = 'd:\\My projects\\Kenouz\\src\\assets\\data\\mushaf.json';
const outputFile = 'd:\\My projects\\Kenouz\\src\\assets\\data\\mushaf.json';

try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    const fixedData = data.map(page => {
        return {
            ...page,
            lines: page.lines.map(line => {
                // We need to map characters from PUA range to ASCII range
                // Based on debuging: \uFC41 (64577) -> \u0021 (33)
                // Difference = 64544
                let newLine = '';
                for (let i = 0; i < line.length; i++) {
                    const charCode = line.charCodeAt(i);
                    // PUA range in mushaf.txt seems to start around FC00 or FC40
                    if (charCode >= 0xFC00) {
                        // This is a rough mapping, let's try to map FC41 to 21
                        // If FC41 is the first word, and 21 is the first word in font.
                        const shifted = charCode - 64544;
                        if (shifted >= 33 && shifted <= 255) {
                            newLine += String.fromCharCode(shifted);
                        } else {
                            // Keep as is if out of range, or handle differently
                            newLine += line[i];
                        }
                    } else if (charCode === 32) {
                        // Keep spaces
                        newLine += ' ';
                    } else {
                        newLine += line[i];
                    }
                }
                return newLine;
            })
        };
    });

    fs.writeFileSync(outputFile, JSON.stringify(fixedData, null, 2), 'utf8');
    console.log('Successfully re-mapped Mushaf data to ASCII range for V1 fonts.');

} catch (err) {
    console.error('Error fixing mapping:', err);
}
