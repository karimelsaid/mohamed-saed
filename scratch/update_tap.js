const fs = require('fs');

// 1. Update TS file
const tsPath = 'src/app/features/mushaf/components/mushaf-page.component.ts';
let tsContent = fs.readFileSync(tsPath, 'utf8');

// Update onTouchStart
tsContent = tsContent.replace(
  /\/\/\s*Double Tap Detection[\s\S]*?this\.lastTapTime\s*=\s*this\.touchStartTime;/,
  `// Double Tap Detection (supports fast and slow double taps up to 600ms)
        if (this.lastTapTime > 0 && (this.touchStartTime - this.lastTapTime) < 600) {
            this.isDoubleTapPending = true;
            this.handleDoubleTap();
            this.lastTapTime = 0;
            setTimeout(() => { this.isDoubleTapPending = false; }, 350);
        } else {
            this.lastTapTime = this.touchStartTime;
        }`
);

// Update onVerticalTouchStart
tsContent = tsContent.replace(
  /onVerticalTouchStart\(event:\s*TouchEvent\):\s*void\s*\{[\s\S]*?this\.lastTapTime\s*=\s*now;\s*\}/,
  `onVerticalTouchStart(event: TouchEvent): void {
        const now = Date.now();
        if (this.lastTapTime > 0 && (now - this.lastTapTime) < 600) {
            this.isDoubleTapPending = true;
            this.handleDoubleTap();
            this.lastTapTime = 0;
            setTimeout(() => { this.isDoubleTapPending = false; }, 350);
        } else {
            this.lastTapTime = now;
        }
    }`
);

fs.writeFileSync(tsPath, tsContent, 'utf8');
console.log('TS updated successfully!');

// 2. Update CSS file
const cssPath = 'src/app/features/mushaf/components/mushaf-page.component.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Replace touch-action: pan-x in .mushaf-page with touch-action: none !important
cssContent = cssContent.replace(
  /\/\*\s*Allow browser to handle horizontal pan natively within page area;[\s\S]*?touch-action:\s*pan-x;\s*\}/,
  `/* Normal slider mode: touch-action: none so custom JavaScript swipe handler receives 100% of gestures */
  touch-action: none !important;
}`
);

// Update Page Image Mode Styles around line 20970
const startMarker = '/* Page Image Mode Styles */';
const endMarker = '/* Eye protection: invert page image colors in dark theme */';
const startIdx = cssContent.indexOf(startMarker);
const endIdx = cssContent.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `/* Page Image Mode Styles */

.mushaf-page-image-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  box-sizing: border-box;
  padding: 10px;
  background: inherit;
  position: relative;
  touch-action: none !important;
  user-select: none;
  -webkit-user-select: none;
}

.hifz-verse-overlay {
  position: absolute;
  inset: 10px;
  z-index: 2;
  width: calc(100% - 20px);
  height: calc(100% - 20px);
  pointer-events: none;
  overflow: visible;
  touch-action: none !important;
}

.hifz-muyassar-image-container .mushaf-page-image {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.hifz-verse-overlay polygon {
  fill: transparent;
  stroke: transparent;
  stroke-width: 0;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
  pointer-events: auto;
  touch-action: none !important;
  transition: fill 0.18s ease, stroke 0.18s ease;
}

.hifz-verse-overlay polygon:hover,
.hifz-verse-overlay polygon.active {
  fill: rgba(250, 204, 21, 0.14);
  stroke: transparent;
}

.mushaf-page-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: filter 0.3s ease;
  pointer-events: none;
  touch-action: none !important;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

/* In continuous vertical mode, allow vertical dragging/panning over images */
.mushaf-vertical-viewer .mushaf-page-image-container {
  width: 100%;
  height: auto !important;
  touch-action: pan-y !important;
}

.mushaf-vertical-viewer .mushaf-page-image {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: none !important;
  touch-action: pan-y !important;
  pointer-events: none;
  -webkit-user-drag: none;
}

`;

  cssContent = cssContent.slice(0, startIdx) + replacement + cssContent.slice(endIdx);
}

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('CSS updated successfully!');
