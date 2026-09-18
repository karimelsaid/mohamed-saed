const fs = require('fs');
const file = '/Users/orabi/Downloads/kenouz/src/app/book-details/book-details.component.html';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const replacement = `<!-- Fullscreen Image Modal -->
<div *ngIf="isImageModalOpen && availableImages.length > 0" 
  class="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
  (click)="onModalBackdropClick($event)">
  
  <!-- Close Button -->
  <button class="absolute top-4 right-4 sm:top-6 sm:right-6 text-white hover:text-gray-300 transition-colors bg-black/50 hover:bg-black/80 rounded-full w-12 h-12 flex items-center justify-center text-3xl z-10 cursor-pointer"
    (click)="closeImageModal()" title="إغلاق">
    &times;
  </button>
  
  <!-- Main Image Display with Zoom/Pan Support -->
  <div class="relative w-full max-w-5xl h-full max-h-[85vh] flex items-center justify-center overflow-hidden" 
    (click)="onModalBackdropClick($event)">
    <img [src]="availableImages[selectedImageIndex] || ''" [alt]="book?.product_name" 
      class="max-w-full max-h-full object-contain shadow-2xl rounded-lg cursor-zoom-in transition-transform duration-100 ease-out will-change-transform touch-none"
      [style.transform]="getImageTransform()"
      (dblclick)="onImageDoubleTap($event)"
      (touchstart)="onImageTouchStart($event)"
      (touchmove)="onImageTouchMove($event)"
      (touchend)="onImageTouchEnd($event)"
      (touchcancel)="onImageTouchEnd($event)" />
  </div>`;

// Lines are 1-indexed in our heads, but 0-indexed in array.
// 754 is index 753
// 769 is index 768

lines.splice(753, 769 - 754 + 1, replacement);

fs.writeFileSync(file, lines.join('\n'));
console.log("Replaced using splice.");
