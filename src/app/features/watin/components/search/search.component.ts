import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-watin-search',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="watin-app-bar">
      <div class="search-input-container">
        <i class="fas fa-search search-icon"></i>
        <input type="text" class="search-input" placeholder="ابحث عن محاضرة أو شيخ أو كتاب...">
        <button class="filter-btn"><i class="fas fa-sliders-h"></i></button>
      </div>
    </header>

    <div class="page-content">
      <!-- Search Chips -->
      <div class="chips-container">
        <button class="chip active">الكل</button>
        <button class="chip">محاضرات</button>
        <button class="chip">تفريغات</button>
        <button class="chip">كتب</button>
        <button class="chip">ملاحظات</button>
      </div>

      <!-- Search Results -->
      <div class="results-container">
        <h3 class="results-title">النتائج المقترحة</h3>
        
        <div class="result-item">
          <div class="result-icon lecture-icon"><i class="fas fa-microphone-alt"></i></div>
          <div class="result-details">
            <h4>تفسير سورة الفاتحة</h4>
            <p>درس صوتي • المدة: ٤٥ دقيقة</p>
          </div>
        </div>

        <div class="result-item">
          <div class="result-icon transcript-icon"><i class="fas fa-file-alt"></i></div>
          <div class="result-details">
            <h4>أحكام التجويد الميسرة</h4>
            <p>تفريغ نصي • يحتوي على تطابق لـ ١٢ آية</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .watin-app-bar {
      padding: 15px 20px;
      background-color: var(--watin-surface);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    }
    .search-input-container {
      display: flex;
      align-items: center;
      background-color: var(--watin-bg);
      border-radius: 12px;
      padding: 5px 15px;
      border: 1px solid var(--watin-cream);
    }
    .search-icon {
      color: var(--watin-sage);
      font-size: 16px;
    }
    .search-input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 10px 15px;
      font-family: inherit;
      font-size: 14px;
      color: var(--watin-text);
      outline: none;
    }
    .search-input::placeholder {
      color: var(--watin-sage);
    }
    .filter-btn {
      background: none;
      border: none;
      color: var(--watin-forest);
      font-size: 18px;
      cursor: pointer;
    }
    
    .page-content {
      padding: 20px;
    }
    .chips-container {
      display: flex;
      gap: 10px;
      margin-bottom: 25px;
      overflow-x: auto;
      padding-bottom: 5px;
    }
    .chip {
      background-color: var(--watin-cream);
      color: var(--watin-olive);
      border: none;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.3s;
    }
    .chip.active {
      background-color: var(--watin-forest);
      color: white;
    }

    .results-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--watin-forest);
      margin-bottom: 15px;
    }
    
    .results-container {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .result-item {
      display: flex;
      align-items: center;
      gap: 15px;
      background-color: var(--watin-surface);
      padding: 15px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    }
    .result-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .lecture-icon {
      background-color: rgba(107, 125, 92, 0.15);
      color: var(--watin-olive);
    }
    .transcript-icon {
      background-color: rgba(168, 149, 114, 0.15);
      color: var(--watin-sand);
    }
    .result-details h4 {
      margin: 0 0 5px 0;
      font-size: 14px;
      color: var(--watin-text);
      font-weight: 700;
    }
    .result-details p {
      margin: 0;
      font-size: 12px;
      color: var(--watin-sage);
    }
  `]
})
export class SearchComponent {}
