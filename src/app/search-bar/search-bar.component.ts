import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { faSearch, faFilter } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css'],
  standalone: false
})
export class SearchBarComponent {
  @Input() allBooks: any[] = [];
  @Output() searchExecuted = new EventEmitter<{ query: string, filter: string }>();

  faSearch = faSearch;
  faFilter = faFilter;
  searchQuery: string = '';
  searchResults: any[] = [];
  showFilterDropdown: boolean = false;
  selectedFilter: string = 'all';

  @ViewChild('inputElement') inputElement!: ElementRef;

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
    }
  }

  selectSuggestion(productName: string) {
    this.searchQuery = productName;
    this.searchResults = [];
    this.emitSearch();
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
    if (this.searchQuery.trim()) {
      const normalizedQuery = this.normalizeArabic(this.searchQuery.toLowerCase());
      this.searchResults = this.allBooks.filter(book => {
        if (!book.product_name || typeof book.product_name !== 'string') {
          return false;
        }
        const normalizedProductName = this.normalizeArabic(book.product_name.toLowerCase());
        return normalizedProductName.includes(normalizedQuery);
      });
      // Sort results to prioritize books starting with the exact original query
      const originalQueryLower = this.searchQuery.toLowerCase();
      this.searchResults.sort((a, b) => {
        const aStarts = a.product_name.toLowerCase().startsWith(originalQueryLower);
        const bStarts = b.product_name.toLowerCase().startsWith(originalQueryLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
      this.emitSearch();
    } else {
      this.searchResults = [];
      this.emitSearch();
    }
  }

  onEnterPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.onSearch();
      this.searchResults = [];
      this.inputElement.nativeElement.blur();
    }
  }
}
