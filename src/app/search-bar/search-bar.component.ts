import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { faSearch, faFilter, faBook, faClock, faList } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule]
})
export class SearchBarComponent implements OnInit {
  @Input() allBooks: any[] = [];
  @Output() searchExecuted = new EventEmitter<{ query: string, filter: string }>();

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
  private debounceDelay = 220; // ms

  @ViewChild('inputElement') inputElement!: ElementRef;

  constructor(
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router
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
    // Use URLSearchParams for the most direct and reliable access to query params
    const q = new URLSearchParams(window.location.search).get('q');
    if (q !== null) {
      this.searchQuery = q;
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

  emitSearch() {
    this.searchExecuted.emit({ query: this.searchQuery.trim(), filter: this.selectedFilter });
  }

  onSearch() {
    if (this.searchQuery.trim()) {
      this.emitSearch();
      this.searchResults = [];
      this.showSuggestions = false;
    }
  }

  selectSuggestion(value: string) {
    this.searchQuery = value;
    this.searchResults = [];
    this.emitSearch();
    this.showSuggestions = false;
  }

  private normalizeArabic(text: string): string {
    return text
      .replace(/[أإآ]/g, 'ا')
      .replace(/[هة]/g, 'ه')
      // Remove special characters except numbers and letters
      .replace(/[^0-9a-zA-Z\u0600-\u06FF\s]/g, '')
      // Remove extra spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  onSearchKeyup() {
    // Debounce quick typing
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.performSearch(), this.debounceDelay);
  }

  private performSearch() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.emitSearch();
      this.showSuggestions = false;
      return;
    }

    const original = this.searchQuery.trim();
    const q = this.normalizeArabic(original.toLowerCase());

    const results: Array<{ item: any; score: number; highlighted: SafeHtml }> = [];

    for (const prod of this.allBooks) {
      if (!prod) continue;
      const fields: string[] = [];
      if (prod.product_name && typeof prod.product_name === 'string') fields.push(prod.product_name);
      if (prod.sku && typeof prod.sku === 'string') fields.push(prod.sku);
      if (prod.category && typeof prod.category === 'string') fields.push(prod.category);
      if (prod.tags && Array.isArray(prod.tags)) fields.push(prod.tags.join(' '));
      if (prod.description && typeof prod.description === 'string') fields.push(prod.description);

      let bestScore = 0;
      let bestField = '';
      for (const f of fields) {
        const nf = this.normalizeArabic(f.toLowerCase());
        if (!nf) continue;
        if (nf.includes(q)) {
          // exact substring match -> high score
          const pos = nf.indexOf(q);
          // higher score if starts with query
          const score = 1 + (pos === 0 ? 0.5 : 0) + Math.min(0.4, 0.4 / (pos + 1));
          if (score > bestScore) { bestScore = score; bestField = f; }
        } else {
          // fallback to fuzzy similarity
          const sim = this.similarity(q, nf);
          if (sim > bestScore) { bestScore = sim; bestField = f; }
        }
      }

      // Accept results with reasonable score
      if (bestScore >= 0.45) {
        const highlighted = this.createHighlight(bestField || (prod.product_name || ''), q);
        results.push({ item: prod, score: bestScore, highlighted });
      }
    }

    // Sort by score and whether name starts with the query
    results.sort((a, b) => {
      const aName = (a.item.product_name || '').toLowerCase();
      const bName = (b.item.product_name || '').toLowerCase();
      const qLower = original.toLowerCase();
      const aStarts = aName.startsWith(qLower) ? 1 : 0;
      const bStarts = bName.startsWith(qLower) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return b.score - a.score;
    });

    this.searchResults = results.slice(0, 40);
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
