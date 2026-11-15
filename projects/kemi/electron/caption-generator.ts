import * as fs from 'fs';
import * as path from 'path';

export interface CaptionOptions {
  enabled?: boolean;
  style?: string;
  fontSize?: number;
  fontScalePercent?: number;
  position?: 'bottom' | 'middle' | 'top';
  wordsPerLine?: number;
  format?: string;
  previewViewportHeight?: number;
}

interface PresetConfig {
  name: string;
  hasBorder: boolean;
  borderColour?: string;
  boxColour?: string;
  primaryColour: string;
  activeColour: string;
  borderStyle: number; // 3 for opaque box, 1 for outline/shadow
  outlineWidth?: number;
  shadowDepth?: number;
  shadowColour?: string;
}

const PRESETS: Record<string, PresetConfig> = {
  'knooz-default': {
    name: 'KnoozDefault',
    hasBorder: true,
    borderColour: '&H0000D6FF&', // Yellow #ffd600 (BGR)
    boxColour: '&H00000000&',    // Pure solid Black #000000
    primaryColour: '&H00FFFFFF&', // White
    activeColour: '&H0000D6FF&',  // Yellow #ffd600
    borderStyle: 3
  },
  'modern-pop': {
    name: 'ModernPop',
    hasBorder: true,
    borderColour: '&H00C4FF00&', // Cyan / Mint #00ffc4
    boxColour: '&H00271811&',    // Navy slate #111827
    primaryColour: '&H00E1D5CB&', // Soft slate #cbd5e1
    activeColour: '&H00C4FF00&',  // Cyan #00ffc4
    borderStyle: 3
  },
  'punchy-tiktok': {
    name: 'PunchyTikTok',
    hasBorder: false,
    boxColour: '&H00481DE1&',    // Crimson #e11d48
    primaryColour: '&H00FFFFFF&', // White
    activeColour: '&H003BEBFF&',  // TikTok Yellow #ffeb3b
    borderStyle: 3
  },
  'minimal-clean': {
    name: 'MinimalClean',
    hasBorder: false,
    primaryColour: '&H00FFFFFF&', // White
    activeColour: '&H00C4D200&',  // CapCut Accent Cyan #00d2c4
    borderStyle: 1,
    outlineWidth: 2.5,
    shadowDepth: 2,
    shadowColour: '&H90000000&'
  }
};

const FONT_NAME = 'Noto Sans Arabic';

/**
 * Strip invisible Unicode control characters that cause libass to render rectangles.
 * Removes: RTL/LTR marks, zero-width chars, BOM, soft hyphens, directional overrides, etc.
 */
function sanitizeText(text: string): string {
  return text
    // Remove Unicode directional marks and formatting chars
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD\u061C]/g, '')
    // Remove Arabic tatweel/kashida (ـ) at start/end only
    .replace(/^ـ+|ـ+$/g, '')
    .trim();
}

export function generateASS(
  words: Array<{ text: string; start: number; end: number; removed?: boolean }>,
  options: CaptionOptions | string = 'knooz-default',
  outputPath: string,
  aspectFormat: string = '16:9'
): void {
  const opts: any = typeof options === 'string' ? { style: options } : options;
  const styleKey = opts.style || 'knooz-default';
  const preset = PRESETS[styleKey] || PRESETS['knooz-default'];

  // Dimensions based on export aspect ratio
  let resX = 1920;
  let resY = 1080;

  if (aspectFormat === '9:16') {
    resX = 1080;
    resY = 1920;
  } else if (aspectFormat === '1:1') {
    resX = 1080;
    resY = 1080;
  }

  // Proportional font sizing matching preview visual weight:
  // For 9:16 (resY = 1920): 14 * 6.5 = 91px (industry standard for Reels / TikTok)
  // For 16:9 / 1:1 (resY = 1080): 14 * 4.0 = 56px (standard 1080p subtitles)
  const userFontSize = opts.fontSize || 14;
  const ratio = resY === 1920 ? 6.5 : 4.0;
  const fontSize = Math.max(32, Math.min(220, Math.round(userFontSize * ratio)));

  // Position alignment and margin (matches CSS bottom: 12% / top: 12%)
  let alignment = 2; // Bottom center
  let marginV = Math.round(resY * 0.12);

  if (opts.position === 'top') {
    alignment = 8; // Top center
    marginV = Math.round(resY * 0.12);
  } else if (opts.position === 'middle') {
    alignment = 5; // Middle center
    marginV = 0;
  }

  // Box padding (Outline in ASS BorderStyle 3) - scaled with font size
  const boxPadding = Math.max(14, Math.round(fontSize * 0.32));
  const borderPadding = boxPadding + Math.max(4, Math.round(fontSize * 0.07));

  // Generate styles section
  let stylesSection = `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;

  if (preset.borderStyle === 3) {
    if (preset.hasBorder && preset.borderColour) {
      stylesSection += `Style: ${preset.name}Border,${FONT_NAME},${fontSize},&HFF000000&,&H000000FF&,${preset.borderColour},&HFF000000&,1,0,0,0,100,100,0,0,3,${borderPadding},0,${alignment},30,30,${marginV},1\n`;
    }
    stylesSection += `Style: ${preset.name}Box,${FONT_NAME},${fontSize},${preset.primaryColour},&H000000FF&,${preset.boxColour || '&H00000000&'},&HFF000000&,1,0,0,0,100,100,0,0,3,${boxPadding},0,${alignment},30,30,${marginV},1\n`;
  } else {
    // Minimal Clean (BorderStyle 1)
    const outWidth = preset.outlineWidth || 2.5;
    const shDepth = preset.shadowDepth || 2;
    const shCol = preset.shadowColour || '&H90000000&';
    stylesSection += `Style: ${preset.name},${FONT_NAME},${fontSize},${preset.primaryColour},&H000000FF&,&H00111111&,${shCol},1,0,0,0,100,100,0,0,1,${outWidth},${shDepth},${alignment},30,30,${marginV},1\n`;
  }

  const header = `[Script Info]
Title: Kemi Captions
ScriptType: v4.00+
WrapStyle: 2
PlayResX: ${resX}
PlayResY: ${resY}
ScaledBorderAndShadow: yes
YCbCr Matrix: None
Language: ar

[V4+ Styles]
${stylesSection}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const wordsPerLine = opts.wordsPerLine || 3;
  const activeWords = words.filter(w => !w.removed && w.text && sanitizeText(w.text).length > 0);

  let events = '';
  const mainStyleName = preset.borderStyle === 3 ? `${preset.name}Box` : preset.name;
  const borderStyleName = `${preset.name}Border`;

  for (let i = 0; i < activeWords.length; i += wordsPerLine) {
    const chunk = activeWords.slice(i, i + wordsPerLine);
    if (chunk.length === 0) continue;

    const phraseStart = Math.max(0, chunk[0].start);
    const phraseEnd = Math.max(phraseStart + 0.3, chunk[chunk.length - 1].end);
    const chunkPlainText = chunk.map(w => sanitizeText(w.text)).join(' ');

    // 1. If preset has an outer border box, draw Layer 0 across entire phrase duration
    if (preset.borderStyle === 3 && preset.hasBorder) {
      events += `Dialogue: 0,${formatTime(phraseStart)},${formatTime(phraseEnd)},${borderStyleName},,0,0,0,,${chunkPlainText}\n`;
    }

    // 2. Layer 1: Display words with dynamic Karaoke word highlighting
    // Language: ar + Encoding: 178 in styles handles RTL shaping natively in libass
    for (let j = 0; j < chunk.length; j++) {
      const w = chunk[j];
      const wStart = Math.max(phraseStart, w.start);
      const wEnd = j === chunk.length - 1
        ? phraseEnd
        : Math.max(wStart + 0.08, chunk[j + 1].start);

      if (wEnd <= wStart) continue;

      const formattedWords = chunk.map((cWord, idx) => {
        const cleanText = sanitizeText(cWord.text);
        const textClean = cleanText.replace(/^[\-_.,،؛:!?؟]+/, '');
        const wordText = textClean || cleanText;
        if (idx === j) {
          return `{\\1c${preset.activeColour}}${wordText}`;
        } else {
          return `{\\1c${preset.primaryColour}}${wordText}`;
        }
      });

      const lineText = formattedWords.join(' ');
      const layer = preset.borderStyle === 3 && preset.hasBorder ? 1 : 0;
      events += `Dialogue: ${layer},${formatTime(wStart)},${formatTime(wEnd)},${mainStyleName},,0,0,0,,${lineText}\n`;
    }
  }

  const assContent = header + events;
  // Write as UTF-8 with BOM for better libass compatibility
  const bom = '\uFEFF';
  fs.writeFileSync(outputPath, bom + assContent, 'utf-8');
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor((seconds % 1) * 100);

  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export function getAvailableStyles(): string[] {
  return Object.keys(PRESETS);
}
