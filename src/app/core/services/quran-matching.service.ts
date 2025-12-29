import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class QuranMatchingService {

    constructor() { }

    private readonly muqattaatMap: { [key: string]: string[] } = {
        'الم': ['الف', 'لام', 'ميم'],
        'المص': ['الف', 'لام', 'ميم', 'صاد'],
        'الر': ['الف', 'لام', 'را'],
        'المر': ['الف', 'لام', 'ميم', 'را'],
        'كهيعص': ['كاف', 'ها', 'يا', 'عين', 'صاد'],
        'طه': ['طا', 'ها'],
        'طسم': ['طا', 'سين', 'ميم'],
        'طس': ['طا', 'سين'],
        'يس': ['يا', 'سين'],
        'ص': ['صاد'],
        'حم': ['حا', 'ميم'],
        'حم عسق': ['حا', 'ميم', 'عين', 'سين', 'قاف'], // Sometimes combined
        'عسق': ['عين', 'سين', 'قاف'],
        'ق': ['قاف'],
        'ن': ['نون']
    };

    /**
     * Expands Muqatta'at (disjoined letters) into their spoken word forms.
     * e.g. "الم" -> ["الف", "لام", "ميم"]
     * Returns original text in array if not a Muqatta'at word.
     */
    expandMuqattaat(text: string): string[] {
        const normalized = this.normalize(text);
        if (this.muqattaatMap[normalized]) {
            return this.muqattaatMap[normalized];
        }
        // Check fuzzy keys if absolute match fails (e.g. without hamza)
        // This is a simple exact match for now as keys are normalized manually above
        return [text];
    }

    /**
     * Normalizes Arabic text for comparison.
     * Removes Tashkeel, unifies Alefs, Yas, etc.
     */
    normalize(text: string): string {
        if (!text) return '';
        let normalized = text;

        // Remove Tatweel (Kashida)
        normalized = normalized.replace(/ـ/g, '');

        // Remove ALL Tashkeel (Diacritics) - comprehensive range
        normalized = normalized.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

        // Remove Hamza standalone
        normalized = normalized.replace(/ء/g, '');

        // Unify Alefs (all variations to bare Alef)
        normalized = normalized.replace(/[أإآٱ]/g, 'ا');

        // Unify Ya and Alif Maqsura
        normalized = normalized.replace(/[ىئ]/g, 'ي');

        // Unify Ta Marbuta and Ha
        normalized = normalized.replace(/ة/g, 'ه');

        // Unify Waw variations
        normalized = normalized.replace(/ؤ/g, 'و');

        // Handle Lam-Alef ligatures
        normalized = normalized.replace(/لا/g, 'لا');
        normalized = normalized.replace(/[ﻻﻼ]/g, 'لا');

        // Remove non-Arabic characters except spaces
        normalized = normalized.replace(/[^\u0600-\u06FF\s]/g, '');

        // Normalize multiple spaces to single space and trim
        normalized = normalized.replace(/\s+/g, ' ').trim();

        return normalized;
    }

    /**
     * Calculates Levenshtein distance between two strings
     */
    levenshteinDistance(a: string, b: string): number {
        const matrix = [];

        // Increment along the first column of each row
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        // Increment each column in the first row
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in the rest of the matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1  // deletion
                        )
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Checks if spoken word roughly matches expected word
     */
    isMatch(spokenWord: string, expectedWord: string): boolean {
        const normSpoken = this.normalize(spokenWord);
        const normExpected = this.normalize(expectedWord);

        // console.log(`[Matching] '${normSpoken}' vs '${normExpected}'`);

        if (normSpoken === normExpected) return true;

        // LENIENT: For Muqatta'at syllables (الف, لام, ميم, etc.)
        // Just check if the first letter matches - very forgiving
        const muqattaatSyllables = ['الف', 'لام', 'ميم', 'صاد', 'را', 'كاف', 'ها', 'يا', 'عين', 'طا', 'سين', 'قاف', 'نون', 'حا'];
        if (muqattaatSyllables.includes(normExpected)) {
            // Very lenient: if spoken starts with or contains the first letter of expected, it's a match
            const firstLetter = normExpected.charAt(0);
            if (normSpoken.includes(firstLetter) || normSpoken.charAt(0) === firstLetter) {
                return true;
            }
        }

        // Partial inclusion for prefixes like "Wa", "Fa"
        // If expected is "والعصر" and user says "العصر" -> Close enough
        if (normExpected.length > normSpoken.length && normExpected.endsWith(normSpoken)) {
            if (normExpected.length - normSpoken.length <= 2) return true;
        }
        // If expected is "العصر" and user says "والعصر" -> Close enough
        if (normSpoken.length > normExpected.length && normSpoken.endsWith(normExpected)) {
            if (normSpoken.length - normExpected.length <= 2) return true;
        }

        const distance = this.levenshteinDistance(normSpoken, normExpected);
        const maxLength = Math.max(normSpoken.length, normExpected.length);

        // Stricter matching for accuracy (like Tarteel)
        if (maxLength <= 3) return distance <= 1;
        if (maxLength <= 6) return distance <= 1;  // Tightened: was 2
        return distance <= 2;                       // Tightened: was 3
    }

    /**
     * Finds the best match sequence for spoken text within a sequence of expected words.
     * Enhanced to handle: multi-word matching, combined tokens, substring matching.
     */
    findProgress(spokenText: string, expectedWords: string[], currentWordIndex: number): number {
        const spokenTokens = spokenText.split(/\s+/).filter(t => t.length > 0);
        const spokenTokensNorm = spokenTokens.map(t => this.normalize(t));

        // Combine all spoken tokens into one string for substring matching
        const fullSpokenNorm = spokenTokensNorm.join(' ');

        // Look ahead ONLY 2 words to prevent auto-skipping
        const lookAhead = 2;

        // Strategy 1: Check if latest words match any expected word
        const windowSize = 4;
        const searchWindow = spokenTokensNorm.slice(-windowSize);

        for (let w = searchWindow.length - 1; w >= 0; w--) {
            const spokenWord = searchWindow[w];

            for (let i = 0; i < lookAhead; i++) {
                const targetIndex = currentWordIndex + i;
                if (targetIndex >= expectedWords.length) break;

                const expected = expectedWords[targetIndex];

                if (this.isMatch(spokenWord, expected)) {
                    return targetIndex;
                }
            }
        }

        // Strategy 2: Check combined last 2-3 words against expected
        for (let combineCount = 2; combineCount <= 3; combineCount++) {
            if (searchWindow.length >= combineCount) {
                const combined = searchWindow.slice(-combineCount).join('');

                for (let i = 0; i < lookAhead; i++) {
                    const targetIndex = currentWordIndex + i;
                    if (targetIndex >= expectedWords.length) break;

                    const expected = this.normalize(expectedWords[targetIndex]);

                    if (this.isMatch(combined, expected)) {
                        return targetIndex;
                    }
                }
            }
        }

        // Strategy 3: Check if full spoken text contains expected word
        for (let i = 0; i < lookAhead; i++) {
            const targetIndex = currentWordIndex + i;
            if (targetIndex >= expectedWords.length) break;

            const expectedNorm = this.normalize(expectedWords[targetIndex]);

            // Check if the expected word appears in the spoken text
            if (fullSpokenNorm.includes(expectedNorm)) {
                return targetIndex;
            }

            // Removed: overly aggressive partial matching was causing auto-skipping
        }

        return -1;
    }
}
