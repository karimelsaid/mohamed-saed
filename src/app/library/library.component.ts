import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription as RxSubscription } from 'rxjs';
import { EbookService } from '../services/ebook.service';
import { SubscriptionService } from '../services/subscription.service';
import { UserLibraryService } from '../services/user-library.service';
import { OfflineEbookService } from '../services/offline-ebook.service';
import { ExternalLibraryService, ExternalBook } from '../services/external-library.service';
import { AuthService } from '../auth/auth.service';
import { Ebook, Subscription } from '../models/ebook.model';
import { environment } from '../../environments/environment';

// Import New Services and Components
import { DownloadManagerService, DownloadProgress } from '../services/download-manager.service';
import { DownloadsComponent } from '../downloads/downloads.component';

@Component({
    selector: 'app-library',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DownloadsComponent],
    templateUrl: './library.component.html',
    styleUrls: ['./library.component.css']
})
export class LibraryComponent implements OnInit, OnDestroy {
    // Internal Books State
    ebooks: Ebook[] = [];
    filteredEbooks: Ebook[] = [];
    ownedEbookIds: Set<string> = new Set();
    favoriteEbookIds: Set<string> = new Set();

    // External Books State
    externalBooks: ExternalBook[] = [];
    filteredExternalBooks: ExternalBook[] = [];
    externalCategories: string[] = [];
    externalCurrentPage: number = 1;
    externalItemsPerPage: number = 24;
    externalTotalItems: number = 0;
    paginatedExternalBooks: ExternalBook[] = [];

    // Download State
    downloadStates: { [id: string]: DownloadProgress } = {};
    downloadedBooks: Set<string> = new Set();

    // Internal Download State
    internalDownloadStates: { [id: string]: { state: string; progress: number } | null } = {}; // Tracks progress
    downloadedInternalBooks: Set<string> = new Set();

    totalDownloadsCount: number = 0; // Combined count from internal + external

    // General State
    activeTab: 'internal' | 'external' | 'downloads' = 'internal';
    downloadsTab: 'downloads' | 'favorites' = 'downloads';
    subscription: Subscription | null = null;
    subscriptionHistory: Subscription[] = [];
    isLoading = true;
    error: string | null = null;

    categories: string[] = [];

    // UI Filters
    selectedCategory: string = '';
    searchQuery: string = '';
    viewMode: 'all' | 'owned' | 'favorites' | 'subscription' = 'all';
    showDownloadedOnly: boolean = false;

    // Pagination State (Internal)
    currentPage: number = 1;
    itemsPerPage: number = 20;
    totalBooks: number = 0;
    hasMoreBooks: boolean = false;
    isLoadingMore: boolean = false;

    private uploadsBaseUrl = environment.uploadsBaseUrl;
    private subscriptions: RxSubscription[] = [];

    constructor(
        private ebookService: EbookService,
        private subscriptionService: SubscriptionService,
        private userLibraryService: UserLibraryService,
        private authService: AuthService,
        private offlineEbookService: OfflineEbookService,
        private externalLibraryService: ExternalLibraryService,
        private downloadManager: DownloadManagerService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            if (params['tab']) {
                this.setActiveTab(params['tab']);
            }
        });

        this.categories = this.ebookService.getCategories();
        this.subscriptionService.refreshStatus();
        this.loadData();
        this.loadExternalData();

        // Subscribe to subscription status changes
        const sub = this.subscriptionService.subscriptionStatus$.subscribe(status => {
            this.subscription = status;
            if (status) {
                this.loadSubscriptionHistory();
            }
        });
        this.subscriptions.push(sub);

        // Subscribe to Favorite IDs
        const favSub = this.authService.favoriteBookIds.subscribe(ids => {
            this.favoriteEbookIds = new Set(ids);
            if (this.viewMode === 'favorites') {
                this.applyFilters();
            }
        });
        this.subscriptions.push(favSub);

        // Subscribe to Downloaded Book IDs (for persistence across page refresh)
        const downloadSub = this.downloadManager.downloadedBookIds$.subscribe(ids => {
            this.downloadedBooks = ids;
            this.updateTotalDownloadsCount();
        });
        this.subscriptions.push(downloadSub);

        // Initial load of total downloads count
        this.updateTotalDownloadsCount();

        // Ensure favorites are loaded (if user is logged in)
        this.authService.user$.subscribe(user => {
            if (user && user.id) {
                this.authService.loadUserData(user.id);
            }
        });

        this.checkInternalDownloads();
    }

    loadSubscriptionHistory() {
        this.subscriptionService.getSubscriptionHistory().subscribe({
            next: (res) => {
                if (res.success) {
                    this.subscriptionHistory = res.data;
                }
            },
            error: (err) => console.error('Error loading history', err)
        });
    }

    checkUrlForDownload() {
        // Implementation kept if needed, but not strictly required for fix
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    // --- Internal Books Logic ---
    loadData(append: boolean = false): void {
        if (append) {
            this.isLoadingMore = true;
        } else {
            this.isLoading = true;
            this.currentPage = 1;
            this.ebooks = [];
        }

        this.error = null;
        const filters = { category: this.selectedCategory, search: this.searchQuery };

        this.ebookService.getEbooks(filters, this.currentPage, this.itemsPerPage).subscribe({
            next: (response) => {
                if (append) this.ebooks = [...this.ebooks, ...response.data];
                else this.ebooks = response.data;
                this.totalBooks = response.total;
                this.hasMoreBooks = this.ebooks.length < this.totalBooks;
                this.applyFilters();
                this.isLoading = false;
                this.isLoadingMore = false;
            },
            error: (err) => {
                console.error('Error loading ebooks:', err);
                if (!append) this.handleOfflineLoad();
                else { this.isLoading = false; this.isLoadingMore = false; }
            }
        });

        if (!append) {
            this.userLibraryService.getUserLibrary().subscribe({
                next: (response) => {
                    this.ownedEbookIds = new Set(response.data.map((item: any) => typeof item.ebookId === 'object' ? item.ebookId._id : item.ebookId));
                },
                error: (err) => console.error('Error loading library:', err)
            });
        }
    }

    private handleOfflineLoad(): void {
        this.isLoading = true;
        this.offlineEbookService.getCachedBooks().then(books => {
            this.ebooks = books;
            this.filteredEbooks = books;
            this.isLoading = false;
            books.forEach(b => this.ownedEbookIds.add(b._id));
        });
    }

    // --- External Books Logic ---
    loadExternalData(): void {
        this.externalLibraryService.getAllBooks().subscribe({
            next: (books) => {
                this.externalBooks = books;
                this.externalCategories = this.externalLibraryService.getUniqueCategories(books);
                this.applyExternalFilters();
            },
            error: (err) => console.error('Failed to load external books', err)
        });
    }

    applyExternalFilters(): void {
        let filtered = this.externalBooks;
        if (this.selectedCategory) filtered = filtered.filter(b => b.category === this.selectedCategory);
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(b => b.title.toLowerCase().includes(query) || b.author.toLowerCase().includes(query));
        }
        if (this.showDownloadedOnly) filtered = filtered.filter(b => this.downloadedBooks.has(b.id));

        this.filteredExternalBooks = filtered;
        this.externalTotalItems = filtered.length;
        this.externalCurrentPage = 1;
        this.updatePaginatedExternalBooks();
    }

    updatePaginatedExternalBooks(): void {
        const startIndex = (this.externalCurrentPage - 1) * this.externalItemsPerPage;
        const endIndex = startIndex + this.externalItemsPerPage;
        this.paginatedExternalBooks = this.filteredExternalBooks.slice(startIndex, endIndex);
    }

    get totalExternalPages(): number {
        return Math.ceil(this.externalTotalItems / this.externalItemsPerPage);
    }

    // --- Book Request Modal Logic ---
    showRequestModal = false;
    requestBookName = '';
    requestAuthorName = '';
    isSubmittingRequest = false;

    openBookRequestModal() {
        this.showRequestModal = true;
    }

    closeBookRequestModal() {
        this.showRequestModal = false;
        this.requestBookName = '';
        this.requestAuthorName = '';
    }

    submitBookRequest() {
        if (!this.requestBookName.trim()) return;

        this.isSubmittingRequest = true;
        this.authService.user$.subscribe(user => {
            if (!user) {
                alert('يجب عليك تسجيل الدخول أولاً لتقديم طلب.');
                this.isSubmittingRequest = false;
                return;
            }

            this.userLibraryService.requestBook(user.id, this.requestBookName, this.requestAuthorName).subscribe({
                next: (res) => {
                    alert('تم إرسال طلبك بنجاح! شكراً لاقتراحك.');
                    this.closeBookRequestModal();
                    this.isSubmittingRequest = false;
                },
                error: (err) => {
                    console.error('Failed to request book:', err);
                    alert('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
                    this.isSubmittingRequest = false;
                }
            });
        }).unsubscribe();
    }

    // --- Tab & Search Interactions ---
    setActiveTab(tab: 'internal' | 'external' | 'downloads') {
        this.activeTab = tab;
        this.selectedCategory = '';
        this.searchQuery = '';
        if (tab === 'internal') this.loadData();
        else if (tab === 'external') this.applyExternalFilters();
    }

    setDownloadsTab(tab: 'downloads' | 'favorites') { this.downloadsTab = tab; }
    onSearch(): void { this.activeTab === 'internal' ? this.loadData(false) : this.applyExternalFilters(); }
    onCategoryChange(): void { this.activeTab === 'internal' ? this.loadData(false) : this.applyExternalFilters(); }
    toggleDownloadedFilter(): void { this.showDownloadedOnly = !this.showDownloadedOnly; this.applyExternalFilters(); }
    loadMore(): void { if (!this.hasMoreBooks || this.isLoadingMore) return; this.currentPage++; this.loadData(true); }

    applyFilters(): void {
        let filtered = [...this.ebooks];
        if (this.selectedCategory) filtered = filtered.filter(e => e.category === this.selectedCategory);
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e => e.title.toLowerCase().includes(query) || e.author.toLowerCase().includes(query) || e.description.toLowerCase().includes(query));
        }
        if (this.viewMode === 'owned') filtered = filtered.filter(e => this.ownedEbookIds.has(e._id));
        else if (this.viewMode === 'subscription') filtered = filtered.filter(e => e.availableForSubscription);
        else if (this.viewMode === 'favorites') filtered = filtered.filter(e => this.favoriteEbookIds.has(e._id));
        this.filteredEbooks = filtered;
    }

    setViewMode(mode: 'all' | 'owned' | 'favorites' | 'subscription'): void {
        this.viewMode = mode;
        this.applyFilters();
    }

    // --- Helpers ---
    formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    getRemainingDays(): number { return this.subscriptionService.getRemainingDays(); }
    hasActiveSubscription(): boolean { return this.subscriptionService.hasActiveSubscription(); }
    getPlanDisplayName(): string { if (!this.subscription) return ''; return this.subscription.plan === 'yearly' ? 'الخطة السنوية' : 'الخطة الشهرية'; }
    getSubscriptionEndDate(): Date | null { return this.subscription ? new Date(this.subscription.endDate) : null; }

    getBookDetailsLink(ebook: Ebook): any[] {
        const slug = ebook.title.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\-]+/g, '').replace(/\-\-+/g, '-');
        return ['/book', ebook._id, slug];
    }

    getCategoryName(category: string): string { return this.ebookService.getCategoryDisplayName(category); }

    hasAccess(ebook: Ebook): boolean { return true; } // Allow access
    isOwned(ebook: Ebook): boolean { return this.ownedEbookIds.has(ebook._id); }
    isFavorite(ebook: Ebook): boolean { return this.offlineEbookService.isLocalFavorite(ebook._id); }

    toggleFavorite(ebook: Ebook, event: Event): void {
        event.preventDefault(); event.stopPropagation();
        if (this.isFavorite(ebook)) this.offlineEbookService.removeLocalFavorite(ebook._id);
        else this.offlineEbookService.addLocalFavorite(ebook._id);
    }

    isFree(ebook: Ebook): boolean { return ebook.price === 0; }

    handleImageError(event: any) {
        event.target.src = 'assets/images/book-placeholder.jpg';
    }

    getSubscriptionProgress(): number {
        if (!this.subscription) return 0;
        const start = new Date(this.subscription.startDate).getTime();
        const end = new Date(this.subscription.endDate).getTime();
        const now = new Date().getTime();
        const total = end - start;
        const elapsed = now - start;
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }

    getDaysRemaining(): number {
        if (!this.subscription) return 0;
        const end = new Date(this.subscription.endDate).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    async downloadInvoice(targetSub?: Subscription) {
        const sub = targetSub || this.subscription;
        if (!sub) return;

        // Dynamic import to avoid initial bundle weight
        const jsPDF = (await import('jspdf')).default;

        const doc = new jsPDF();

        const startDate = new Date(sub.startDate).toLocaleDateString('en-GB');
        const endDate = new Date(sub.endDate).toLocaleDateString('en-GB');
        const price = sub.price + ' EGP';
        const planName = sub.plan === 'yearly' ? 'اشتراك سنوي' : 'اشتراك شهري';


        // Header
        doc.setFontSize(22);
        doc.setTextColor(31, 41, 55); // gray-800
        doc.text('INVOICE — knoozbook Digital Library', 20, 25);

        // Bill To
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Bill To:', 20, 50);
        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);
        doc.text('Card Subscriber', 20, 57);

        // Invoice Details
        doc.text('Date: ' + startDate, 20, 70);
        doc.text('Invoice #: ' + sub._id.substring(0, 8).toUpperCase(), 20, 76);

        // Table Header
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('Description', 20, 95);
        doc.text('Period', 100, 95);
        doc.text('Amount', 170, 95);

        doc.setDrawColor(200, 200, 200);
        doc.line(20, 98, 190, 98);

        // Table Row
        doc.setFont('helvetica', 'normal');
        doc.text(`knoozbook Premium Subscription (${sub.plan === 'yearly' ? 'Yearly' : 'Monthly'})`, 20, 108);
        doc.text(`${startDate} - ${endDate}`, 100, 108);
        doc.text(price, 170, 108);

        doc.line(20, 115, 190, 115);

        // Total
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Total: ' + price, 170, 130);

        // Footer
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Thank you for subscribing to knoozbook.', 20, 150);

        doc.save('knoozbook-Invoice.pdf');
    }

    getCoverImageUrl(ebook: Ebook): string {
        if (ebook.coverImage?.startsWith('data:')) return ebook.coverImage;
        if (ebook.coverImage?.startsWith('uploads/ebooks/')) return `${this.uploadsBaseUrl.split('/uploads')[0]}/${ebook.coverImage}`;
        if (ebook.coverImage?.startsWith('uploads/')) return `${this.uploadsBaseUrl}/${ebook.coverImage}`;
        return ebook.coverImage || '';
    }

    hasMiniVersion(ebook: any): boolean { return !!ebook.miniEpubFilePath; }

    // --- External Library Download Logic ---

    // 1. Check Download Permission
    canDownloadExternal(book: ExternalBook): boolean {
        // Allow everyone to download (Reader handles restrictions)
        return true;
    }

    // 2. Check if Book is Downloaded (Ready to Read)
    isBookReady(book: ExternalBook): boolean {
        return this.downloadedBooks.has(book.id);
    }

    // 3. Get Download Progress
    getDownloadState(bookId: string): DownloadProgress | undefined {
        return this.downloadStates[bookId];
    }

    // 4. Handle Download/Read Action
    downloadExternalBook(book: ExternalBook) {
        // Permission Check REMOVED

        // If ready, go to Reader
        if (this.isBookReady(book)) {
            // Check ID format - if it starts with ext_ skip adding prefix
            const targetId = book.id.startsWith('ext') ? book.id : `ext-${book.id}`;
            window.location.href = `/reader/${targetId}?source=shamela`;
            return;
        }

        // If downloading, do nothing
        if (this.downloadStates[book.id]?.state === 'DOWNLOADING' ||
            this.downloadStates[book.id]?.state === 'EXTRACTING') return;

        // Start Download
        this.downloadManager.downloadAndProcessBook(
            book.id,
            book.downloadUrl,
            { title: book.title, author: book.author, category: book.category }
        ).subscribe({
            next: (progress) => {
                this.downloadStates[book.id] = progress;
                // If done, mark as ready
                if (progress.state === 'DONE') {
                    this.downloadedBooks.add(book.id);
                }
            },
            error: (err) => {
                console.error('Download error', err);
                this.downloadStates[book.id] = { state: 'ERROR', progress: 0, error: 'فشل التحميل' };
            }
        });
    }

    // 5. Async Check for Availability
    async checkBookAvailability(bookId: string) {
        if (this.downloadManager && await this.downloadManager.isBookAvailable(bookId)) {
            this.downloadedBooks.add(bookId);
        }
    }

    // 6. External Pagination (using correct method)
    onExternalPageChange(newPage: number): void {
        this.externalCurrentPage = newPage;
        this.updatePaginatedExternalBooks();

        // Scroll to top
        const gridElement = document.querySelector('.ebooks-grid');
        if (gridElement) {
            gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Check availability for new page items
        setTimeout(() => {
            this.paginatedExternalBooks.forEach(b => this.checkBookAvailability(b.id));
        }, 100);
    }

    isExternalFavorite(book: any): boolean {
        return this.offlineEbookService.isLocalFavorite(book.id);
    }

    // 7. Toggle Favorite for External Books
    toggleExternalFavorite(book: any, event: Event) {
        event.stopPropagation();
        event.preventDefault();

        const id = book.id;
        if (this.offlineEbookService.isLocalFavorite(id)) {
            this.offlineEbookService.removeLocalFavorite(id);
        } else {
            this.offlineEbookService.addLocalFavorite(id);
        }
    }

    // Alias for template usage
    canRead(ebook: Ebook): boolean {
        // Allow everyone to open the book (Reader handles restrictions)
        return true;
    }

    openEbook(ebook: Ebook): void {
        // Navigate directly to reader
        this.router.navigate(['/reader', ebook._id]);
    }

    async checkInternalDownloads() {
        try {
            const cachedBooks = await this.offlineEbookService.getCachedBooks();
            this.downloadedInternalBooks.clear();
            cachedBooks.forEach(book => {
                this.downloadedInternalBooks.add(book._id || book.id);
            });
            this.updateTotalDownloadsCount();
        } catch (e) {
            console.error('Error checking internal downloads:', e);
        }
    }

    downloadInternalBook(ebook: Ebook, event: Event) {
        event.stopPropagation(); // Prevent opening book

        if (this.downloadedInternalBooks.has(ebook._id)) return;
        if (this.internalDownloadStates[ebook._id]) return;

        this.internalDownloadStates[ebook._id] = { state: 'PENDING', progress: 0 };

        this.offlineEbookService.downloadBookWithProgress(ebook._id).subscribe({
            next: (status) => {
                this.internalDownloadStates[ebook._id] = status;
                if (status.state === 'DONE') {
                    this.downloadedInternalBooks.add(ebook._id);
                    this.internalDownloadStates[ebook._id] = null; // Clear tracking
                    this.updateTotalDownloadsCount();
                    // Optional: Toast "Download Complete"
                }
            },
            error: (err) => {
                console.error('Download failed', err);
                this.internalDownloadStates[ebook._id] = null;
                // Optional: Toast "Download Failed"
            }
        });
    }

    isInternalBookDownloaded(ebook: Ebook): boolean {
        return this.downloadedInternalBooks.has(ebook._id);
    }

    isInternalBookDownloading(ebook: Ebook): boolean {
        return !!this.internalDownloadStates[ebook._id];
    }

    async updateTotalDownloadsCount(): Promise<void> {
        try {
            const externalCount = this.downloadedBooks.size;
            const internalBooks = await this.offlineEbookService.getCachedBooks();
            const internalCount = internalBooks.length;
            this.totalDownloadsCount = externalCount + internalCount;
        } catch (e) {
            console.error('Error counting downloads:', e);
            this.totalDownloadsCount = this.downloadedBooks.size;
        }
    }

    getInternalDownloadProgress(ebook: Ebook): number {
        const state = this.internalDownloadStates[ebook._id];
        return state ? state.progress : 0;
    }
}
