import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { faSearch, faFilter, faBook, faClock, faList } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule]
})
export class SearchBarComponent {
  @Input() allBooks: any[] = [];
  @Output() searchExecuted = new EventEmitter<{ query: string, filter: string }>();

  faSearch = faSearch;
  faFilter = faFilter;
  faBook = faBook;
  faClock = faClock;
  faList = faList;
  searchQuery: string = '';
  searchResults: any[] = [];
  showFilterDropdown: boolean = false;
  selectedFilter: string = 'all';
  showSuggestions: boolean = false;

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
      this.showSuggestions = false;
    }
  }

  selectSuggestion(productName: string) {
    this.searchQuery = productName;
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
      this.showSuggestions = true;
    } else {
      this.searchResults = [];
      this.emitSearch();
      this.showSuggestions = false;
    }
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
