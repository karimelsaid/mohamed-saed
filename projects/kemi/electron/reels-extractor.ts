export interface TranscriptWord {
  id: string;
  text: string;
  start: number;
  end: number;
  kind: 'word' | 'silence';
  removed: boolean;
  removeReason: any;
}

export interface ReelClip {
  id: string;
  start: number;
  end: number;
  text: string;
  energy: number;
}

export function extractReels(
  transcript: TranscriptWord[],
  minDuration: number = 15,
  maxDuration: number = 60
): ReelClip[] {
  const clips: ReelClip[] = [];
  let currentClip: Partial<ReelClip> | null = null;
  let clipStartTime = 0;

  for (let i = 0; i < transcript.length; i++) {
    const word = transcript[i];

    if (word.removed) {
      // End current clip if any
      if (currentClip && currentClip.start !== undefined) {
        const duration = word.start - currentClip.start;
        if (duration >= minDuration && duration <= maxDuration) {
          clips.push({
            id: `reel_${clips.length}`,
            start: currentClip.start!,
            end: word.start,
            text: currentClip.text || '',
            energy: currentClip.energy ?? 0
          });
        }
        currentClip = null;
      }
      continue;
    }

    if (!currentClip) {
      currentClip = {
        id: `reel_${clips.length}`,
        start: word.start,
        text: word.text,
        energy: 0
      };
      clipStartTime = word.start;
    } else {
      currentClip.text += ' ' + word.text;
      const currentEnergy = currentClip.energy ?? 0;
      currentClip.energy = currentEnergy + 1; // Simple energy metric
    }

    // Check if clip is too long
    const duration = word.end - clipStartTime;
    if (duration > maxDuration) {
      clips.push({
        id: currentClip.id!,
        start: currentClip.start!,
        end: word.end,
        text: currentClip.text || '',
        energy: currentClip.energy ?? 0
      });
      currentClip = null;
    }
  }

  // Add last clip
  if (currentClip && currentClip.start !== undefined) {
    const lastWord = transcript[transcript.length - 1];
    const duration = lastWord.end - currentClip.start;
    if (duration >= minDuration && duration <= maxDuration) {
      clips.push({
        id: currentClip.id!,
        start: currentClip.start!,
        end: lastWord.end,
        text: currentClip.text || '',
        energy: currentClip.energy ?? 0
      });
    }
  }

  return clips;
}
