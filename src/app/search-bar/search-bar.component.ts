import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, HostListener, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { faSearch, faFilter, faBook, faClock, faList } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule]
})
export class SearchBarComponent implements OnInit {
  @Input() allBooks: any[] = [];
  @Output() searchExecuted = new EventEmitter<{ query: string, filter: string, selectedBook?: any }>();

  faSearch = faSearch;
  faFilter = faFilter;
  faBook = faBook;
  faClock = faClock;
  faList = faList;
  searchQuery: string = '';
  // searchResults stores objects with item, score and highlighted html
  searchResults: Array<{ item: any; score: number; highlighted: SafeHtml }> = [];
  showFilterDropdown: boolean = false;
  selectedFilter: string = 'all';
  showSuggestions: boolean = false;
  private debounceTimer: any = null;
  private debounceDelay = 300; // ms - increased for better performance

  @ViewChild('inputElement') inputElement!: ElementRef;

  constructor(
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private analyticsTrackingService: AnalyticsTrackingService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    // Synchronize search query with URL parameters globally
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.syncWithUrl();
    });

    // Initial check (for direct page load)
    this.syncWithUrl();
  }

  private syncWithUrl() {
    if (!isPlatformBrowser(this.platformId)) return;
    // Use URLSearchParams for the most direct and reliable access to query params
    const q = new URLSearchParams(window.location.search).get('q');
    if (q !== null) {
      this.searchQuery = q; // Keep the value exactly as is from URL
    }
  }

  toggleFilterDropdown() {
    this.showFilterDropdown = !this.showFilterDropdown;
  }

  selectFilter(filter: string) {
    this.selectedFilter = filter;
    this.showFilterDropdown = false;
    this.emitSearch();
  }

  emitSearch(selectedBook?: any) {
    this.searchExecuted.emit({ query: this.searchQuery, filter: this.selectedFilter, selectedBook });
  }

  handleInput(event: any) {
    this.searchQuery = event.target.value;
  }

  onSearch(selectedBook?: any) {
    if (this.searchQuery) {
      // Track search event
      this.analyticsTrackingService.trackSearch(this.searchQuery);
      this.emitSearch(selectedBook);
      this.searchResults = [];
      this.showSuggestions = false;
    }
  }

  selectSuggestion(value: string, book?: any) {
    this.searchQuery = value;
    this.searchResults = [];
    this.showSuggestions = false;
    this.onSearch(book);
  }

  private normalizeArabic(text: string): string {
    return text
      .replace(/[أإآا]/g, 'ا')
      .replace(/[هة]/g, 'ه')
      .replace(/[يى]/g, 'ي')
      .replace(/[ؤ]/g, 'و')
      .replace(/[ئ]/g, 'ي')
      // Keep Arabic, English, numbers, and common punctuation
      .replace(/[^0-9a-zA-Z\u0600-\u06FF\s\-_.,()]/g, '');
  }

  onSearchKeyup() {
    // Debounce quick typing
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.performSearch(), this.debounceDelay);
  }

  private performSearch() {
    if (!this.searchQuery) {
      this.searchResults = [];
      this.emitSearch();
      this.showSuggestions = false;
      return;
    }

    const original = this.searchQuery;
    const q = original; // Use original query without normalization

    const results: Array<{ item: any; score: number; highlighted: SafeHtml }> = [];

    for (const prod of this.allBooks) {
      if (!prod) continue;
      // Use fields with priority: title first, then description, then author
      const fields: Array<{ field: string; weight: number }> = [];
      if (prod.product_name && typeof prod.product_name === 'string') fields.push({ field: prod.product_name, weight: 3 });
      if (prod.description && typeof prod.description === 'string') fields.push({ field: prod.description, weight: 2 });
      if (prod.author && typeof prod.author === 'string') fields.push({ field: prod.author, weight: 1 });
      if (prod.sku && typeof prod.sku === 'string') fields.push({ field: prod.sku, weight: 0.5 });
      if (prod.category && typeof prod.category === 'string') fields.push({ field: prod.category, weight: 0.5 });

      let bestScore = 0;
      let bestField = '';
      const qLower = q.toLowerCase();
      
      for (const { field, weight } of fields) {
        const nf = field;
        if (!nf) continue;
        
        const nfLower = nf.toLowerCase();
        
        if (nfLower.includes(qLower)) {
          // exact substring match -> high score
          const pos = nfLower.indexOf(qLower);
          // higher score if starts with query, and apply field weight
          const score = (1 + (pos === 0 ? 0.5 : 0) + Math.min(0.4, 0.4 / (pos + 1))) * weight;
          if (score > bestScore) { bestScore = score; bestField = nf; }
        } else {
          // fallback to fuzzy similarity with weight ONLY for short fields (name, author) to prevent freezing
          // Do NOT run levenshtein on description or very long texts!
          if (nf.length < 200) {
            const sim = this.similarity(qLower, nfLower) * weight;
            if (sim > bestScore) { bestScore = sim; bestField = nf; }
          }
        }
      }

      // Lower threshold to include more results
      if (bestScore >= 0.3) {
        const highlighted = this.createHighlight(bestField || (prod.product_name || ''), q);
        results.push({ item: prod, score: bestScore, highlighted });
      }
    }

    // Sort by score and whether name starts with the query - improved sorting
    results.sort((a, b) => {
      const aName = (a.item.product_name || '').toLowerCase();
      const bName = (b.item.product_name || '').toLowerCase();
      const qNorm = original.toLowerCase();

      // Priority 1: Exact match at start
      const aStartsExact = aName.startsWith(qNorm) ? 3 : 0;
      const bStartsExact = bName.startsWith(qNorm) ? 3 : 0;
      if (aStartsExact !== bStartsExact) return bStartsExact - aStartsExact;

      // Priority 2: Contains query anywhere
      const aContains = aName.includes(qNorm) ? 2 : 0;
      const bContains = bName.includes(qNorm) ? 2 : 0;
      if (aContains !== bContains) return bContains - aContains;

      // Priority 3: Position in name (earlier is better)
      if (aContains && bContains) {
        const aPos = aName.indexOf(qNorm);
        const bPos = bName.indexOf(qNorm);
        if (aPos !== bPos) return aPos - bPos;
      }

      // Priority 4: Score
      return b.score - a.score;
    });

    this.searchResults = results.slice(0, 15); // Reduced for better UX
    this.emitSearch();
    this.showSuggestions = this.searchResults.length > 0;
  }

  // Levenshtein distance
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = new Array(n + 1).fill(0).map(() => 0);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = temp;
      }
    }
    return dp[n];
  }

  // similarity between 0..1
  private similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const dist = this.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    const sim = 1 - dist / maxLen;
    return Math.max(0, sim);
  }

  private createHighlight(text: string, normalizedQuery: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');
    const normText = this.normalizeArabic(text.toLowerCase());
    const q = normalizedQuery.toLowerCase();
    // if substring exists, highlight occurrences
    if (normText.includes(q)) {
      // find positions in original text by searching using normalized mapping
      // simple approach: replace matched normalized slices by marking corresponding original substring
      const idx = normText.indexOf(q);
      // build a simple regex escaping original query
      const originalSlice = text.substr(idx, q.length);
      const escaped = this.escapeHtml(text).replace(new RegExp(this.escapeRegex(originalSlice), 'gi'), (m) => `<mark class="bg-yellow-200 dark:bg-yellow-600/40">${m}</mark>`);
      return this.sanitizer.bypassSecurityTrustHtml(escaped);
    }
    // otherwise return original escaped
    return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(text));
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeRegex(s: string) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  onEnterPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.onSearch();
      this.searchResults = [];
      this.inputElement.nativeElement.blur();
      this.showSuggestions = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.inputElement.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.showSuggestions = false;
    }
  }
}
