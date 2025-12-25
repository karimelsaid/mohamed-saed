import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class QuranMatchingService {

    constructor() { }

    /**
     * Normalizes Arabic text for comparison.
     * Removes Tashkeel, unifies Alefs, Yas, etc.
     */
    normalize(text: string): string {
        if (!text) return '';
        let normalized = text;

        // Remove Tatweel (Kashida)
        normalized = normalized.replace(/ـ/g, '');

        // Remove Tashkeel (Diacritics)
        normalized = normalized.replace(/[\u064B-\u065F\u0670]/g, '');

        // Unify Alefs
        normalized = normalized.replace(/[أإآ]/g, 'ا');

        // Unify Ya and Alif Maqsura
        normalized = normalized.replace(/[ى]/g, 'ي');

        // Unify Ta Marbuta and Ha
        normalized = normalized.replace(/ة/g, 'ه');

        // Normalize spaces and trim
        return normalized.trim();
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

        if (maxLength <= 3) return distance === 0;
        if (maxLength <= 6) return distance <= 1;
        return distance <= 2;
    }

    /**
     * Finds the best match sequence for spoken text within a sequence of expected words.
     * Checks last 3 spoken words against next 3 expected words.
     */
    findProgress(spokenText: string, expectedWords: string[], currentWordIndex: number): number {
        const spokenTokens = spokenText.split(/\s+/).filter(t => t.length > 0);
        const spokenTokensNorm = spokenTokens.map(t => this.normalize(t));

        // Look at the LAST 3 words spoken to find a match
        // This helps if the user said "Word1 Word2" quickly
        const windowSize = 3;
        const searchWindow = spokenTokensNorm.slice(-windowSize);

        // Look ahead up to 3 words
        const lookAhead = 3;

        // Search backwards from the last spoken word
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

        return -1;
    }
}
