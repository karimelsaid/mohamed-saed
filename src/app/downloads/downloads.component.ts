import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DownloadManagerService, DownloadedBook } from '../services/download-manager.service';
import { OfflineEbookService } from '../services/offline-ebook.service';
import { AuthService } from '../auth/auth.service';
import { ExternalLibraryService, ExternalBook } from '../services/external-library.service';
import { EbookService } from '../services/ebook.service';

interface CombinedDownload {
  id: string;
  title: string;
  author?: string;
  category?: string;
  source: 'internal' | 'external';
  downloadDate?: number;
  contentLength?: number;
}

@Component({
  selector: 'app-downloads',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './downloads.component.html',
  styleUrl: './downloads.component.css'
})
export class DownloadsComponent implements OnInit {
  @Input() activeTab: 'downloads' | 'favorites' = 'downloads';

  // Combined downloads (internal + external)
  allDownloads: CombinedDownload[] = [];
  favorites: CombinedDownload[] = []; // Fixed type

  // Data sources
  externalDownloads: DownloadedBook[] = [];
  internalDownloads: any[] = [];
  allExternalBooks: ExternalBook[] = [];

  isLoading = true;
  downloadedBookIds = new Set<string>();

  constructor(
    private downloadManager: DownloadManagerService,
    private offlineEbookService: OfflineEbookService,
    private authService: AuthService,
    private externalLibraryService: ExternalLibraryService,
    private ebookService: EbookService
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    this.allDownloads = [];

    try {
      // 1. Load external downloaded books (Shamela)
      this.externalDownloads = await this.downloadManager.getAllDownloadedBooks();

      // 2. Load internal cached books (EPUBs)
      this.internalDownloads = await this.offlineEbookService.getCachedBooks();

      // 3. Combine all downloads
      this.combineDownloads();

      // 4. Get downloaded IDs for quick lookup
      this.downloadedBookIds = new Set(this.allDownloads.map(d => d.id));

      // 5. Load favorites (Local now)
      this.loadFavorites();

    } catch (e) {
      console.error('Error loading data:', e);
    }

    this.isLoading = false;
  }

  combineDownloads() {
    // Add external downloads
    for (const book of this.externalDownloads) {
      this.allDownloads.push({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        source: 'external',
        downloadDate: book.downloadDate,
        contentLength: book.contentLength
      });
    }

    // Add internal downloads
    for (const book of this.internalDownloads) {
      // Avoid duplicates
      if (!this.allDownloads.find(d => d.id === (book._id || book.id || book.ebookId))) {
        this.allDownloads.push({
          id: book._id || book.id || book.ebookId,
          title: book.title || book.metadata?.title || 'كتاب',
          author: book.author || book.metadata?.author || 'مؤلف غير معروف',
          category: book.category || book.metadata?.category || 'عام',
          source: 'internal',
          downloadDate: book.downloadDate || book.timestamp || Date.now(),
          contentLength: book.size || book.contentLength || 0
        });
      }
    }

    // Sort by download date (newest first)
    this.allDownloads.sort((a, b) => (b.downloadDate || 0) - (a.downloadDate || 0));
  }

  setActiveTab(tab: 'downloads' | 'favorites') {
    this.activeTab = tab;
  }

  // Modal State
  showDeleteModal = false;
  itemToDelete: CombinedDownload | null = null;

  deleteDownload(book: CombinedDownload) {
    this.itemToDelete = book;
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
    this.itemToDelete = null;
  }

  async confirmDelete() {
    if (!this.itemToDelete) return;

    const book = this.itemToDelete;
    this.showDeleteModal = false; // Close immediately or wait? Better close and show loading if needed, but here instant is fine.

    try {
      if (book.source === 'external') {
        await this.downloadManager.deleteBook(book.id);
      } else {
        // Internal book deletion
        await this.offlineEbookService.deleteBook(book.id);
      }

      this.allDownloads = this.allDownloads.filter(d => d.id !== book.id);
      this.downloadedBookIds.delete(book.id);

      // Also remove from local favorites if needed
      if (this.offlineEbookService.isLocalFavorite(book.id)) {
        this.offlineEbookService.removeLocalFavorite(book.id);
        this.loadFavorites();
      }

    } catch (e) {
      console.error('Error deleting book:', e);
    } finally {
      this.itemToDelete = null;
    }
  }

  // --- Local Favorites Logic ---

  toggleFavorite(book: CombinedDownload) {
    if (this.isFavorite(book.id)) {
      this.offlineEbookService.removeLocalFavorite(book.id);
    } else {
      this.offlineEbookService.addLocalFavorite(book.id);
    }
    this.loadFavorites();
  }

  // Template alias for removing favorite
  removeFavorite(book: CombinedDownload) {
    this.offlineEbookService.removeLocalFavorite(book.id);
    this.loadFavorites();
  }

  isFavorite(bookId: string): boolean {
    return this.offlineEbookService.isLocalFavorite(bookId);
  }

  async loadFavorites() {
    this.favorites = [];
    const favoriteIds = this.offlineEbookService.getLocalFavorites();

    // 1. Find favorites that are already downloaded
    const downloadedFavorites = this.allDownloads.filter(d => favoriteIds.includes(d.id));
    this.favorites = [...downloadedFavorites];

    // 2. Find missing favorites (not downloaded)
    const missingIds = favoriteIds.filter(id => !downloadedFavorites.some(d => d.id === id));

    // 3. Fetch metadata for missing items
    if (missingIds.length > 0) {
      // External Books (Start with 'ext_')
      const externalMissingIds = missingIds.filter(id => id.startsWith('ext_'));

      if (externalMissingIds.length > 0) {
        this.externalLibraryService.getAllBooks().subscribe(books => {
          const missingBooks = books.filter(b => externalMissingIds.includes(b.id));
          const missingDownloads: CombinedDownload[] = missingBooks.map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            category: b.category,
            source: 'external',
            downloadDate: 0, // Not downloaded
            contentLength: 0
          }));

          // Add to favorites and re-sort
          this.favorites = [...this.favorites, ...missingDownloads];
          this.favorites.sort((a, b) => {
            // Sort downloaded first? or all by date? 
            // Let's sort by downloaded status then title for now
            if (this.isDownloaded(a.id) === this.isDownloaded(b.id)) {
              return 0;
            }
            return this.isDownloaded(a.id) ? -1 : 1;
          });
        });
      }
    }
  }

  openBook(book: CombinedDownload) {
    if (book.source === 'external') {
      window.location.href = `/reader/${book.id}?source=shamela`;
    } else {
      window.location.href = `/reader/${book.id}`;
    }
  }

  openFavorite(bookId: string) {
    // Find the book to know the source
    const book = this.allDownloads.find(d => d.id === bookId);
    if (book) {
      this.openBook(book);
    } else {
      // Fallback if not found in downloads (maybe try generic open)
      window.location.href = `/reader/${bookId}`;
    }
  }

  isDownloaded(bookId: string): boolean {
    return this.downloadedBookIds.has(bookId);
  }

  getSourceLabel(source: string): string {
    return source === 'external' ? 'الشاملة' : 'مكتبة الموقع';
  }

  getSourceClass(source: string): string {
    return source === 'external' ? 'source-external' : 'source-internal';
  }

  formatDate(timestamp: number | undefined): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatSize(bytes: number | undefined): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
