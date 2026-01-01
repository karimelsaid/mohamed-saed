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

        // Remove ALL Tashkeel and small signs (Diacritics)
        // Includes: \u0610-\u061A (honorifics), \u064B-\u065F (vowels), \u0670 (small alef), \u06D6-\u06ED (small signs)
        normalized = normalized.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

        // Unify Alefs
        normalized = normalized.replace(/[أإآٱ]/g, 'ا');

        // Unify Ya and Alif Maqsura and Hamza on Ya
        normalized = normalized.replace(/[ىئ]/g, 'ي');

        // Unify Ta Marbuta and Ha
        normalized = normalized.replace(/ة/g, 'ه');

        // Unify Waw variations
        normalized = normalized.replace(/ؤ/g, 'و');

        // Remove Hamza standalone (ء) as it's often ignored or added inconsistently
        normalized = normalized.replace(/ء/g, '');

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
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
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

        if (!normSpoken || !normExpected) return false;
        if (normSpoken === normExpected) return true;

        // LENIENT: For Muqatta'at syllables
        const muqattaatSyllables = ['الف', 'لام', 'ميم', 'صاد', 'را', 'كاف', 'ها', 'يا', 'عين', 'طا', 'سين', 'قاف', 'نون', 'حا'];
        if (muqattaatSyllables.includes(normExpected)) {
            const firstLetter = normExpected.charAt(0);
            if (normSpoken.includes(firstLetter) || normSpoken.charAt(0) === firstLetter) {
                return true;
            }
        }

        // Partial inclusion for prefixes like "Wa", "Fa"
        if (normExpected.length > normSpoken.length && normExpected.endsWith(normSpoken)) {
            if (normExpected.length - normSpoken.length <= 2) return true;
        }
        if (normSpoken.length > normExpected.length && normSpoken.endsWith(normExpected)) {
            if (normSpoken.length - normExpected.length <= 2) return true;
        }

        const distance = this.levenshteinDistance(normSpoken, normExpected);
        const maxLength = Math.max(normSpoken.length, normExpected.length);

        // Relaxed matching for voice recognition artifacts
        if (maxLength <= 3) return distance <= 1;
        if (maxLength <= 6) return distance <= 2; // Relaxed: was 1
        return distance <= 3;                    // Relaxed: was 2
    }

    /**
     * Finds the best match sequence for spoken text within a sequence of expected words.
     * Enhanced to handle: multi-word matching, combined tokens, substring matching.
     */
    findProgress(spokenText: string, expectedWords: string[], currentWordIndex: number): number {
        const spokenTokens = spokenText.split(/\s+/).filter(t => t.length > 0);
        const spokenTokensNorm = spokenTokens.map(t => this.normalize(t));

        // Strategy 1: Look ahead in expected words (up to 3 words)
        // Check if any of the LATEST 5 spoken words match the next expected words
        const lookAhead = 3;
        const windowSize = 5;
        const searchWindow = spokenTokensNorm.slice(-windowSize);

        for (let w = searchWindow.length - 1; w >= 0; w--) {
            const spokenWord = searchWindow[w];
            for (let i = 0; i < lookAhead; i++) {
                const targetIndex = currentWordIndex + i;
                if (targetIndex >= expectedWords.length) break;

                if (this.isMatch(spokenWord, expectedWords[targetIndex])) {
                    return targetIndex;
                }
            }
        }

        // Strategy 2: Check combined tokens (concatenated last 2 words)
        // Helps with words split by the recognizer (e.g. "في ما" -> "فيما")
        if (searchWindow.length >= 2) {
            const combined = searchWindow[searchWindow.length - 2] + searchWindow[searchWindow.length - 1];
            for (let i = 0; i < lookAhead; i++) {
                const targetIndex = currentWordIndex + i;
                if (targetIndex >= expectedWords.length) break;

                if (this.isMatch(combined, expectedWords[targetIndex])) {
                    return targetIndex;
                }
            }
        }

        // Strategy 3: Substring match for longer words or combined phrases
        const fullSpokenNorm = spokenTokensNorm.join(' ');
        for (let i = 0; i < lookAhead; i++) {
            const targetIndex = currentWordIndex + i;
            if (targetIndex >= expectedWords.length) break;

            const expectedNorm = this.normalize(expectedWords[targetIndex]);
            if (expectedNorm.length >= 4 && fullSpokenNorm.includes(expectedNorm)) {
                return targetIndex;
            }
        }

        return -1;
    }
}
