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
import { GamificationDashboardComponent } from '../gamification/dashboard/dashboard.component';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export interface UnifiedBook {
    id: string;
    title: string;
    author: string;
    coverUrl: string;
    category: string;
    source: 'internal' | 'external';
    rating?: number;
    isFree?: boolean; // Internal specific
    originalObject: any; // Keep ref to original for actions
    isDownloaded: boolean;
    isDownloading: boolean;
    downloadProgress?: number;
}

@Component({
    selector: 'app-library',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DownloadsComponent, GamificationDashboardComponent],
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
    // 'books' covers both internal and external (merged view)
    // 'achievements' is the new tab
    activeTab: 'books' | 'achievements' | 'downloads' = 'books';
    downloadsTab: 'downloads' | 'favorites' = 'downloads';
    subscription: Subscription | null = null;
    subscriptionHistory: Subscription[] = [];
    isLoading = true;
    error: string | null = null;



    // --- Unified Data Interface ---
    unifiedBooks: UnifiedBook[] = [];

    categories: string[] = [];
    allCategories: string[] = []; // Unified list

    // UI Filters
    selectedCategory: string = '';
    searchQuery: string = '';
    viewMode: 'all' | 'owned' | 'favorites' | 'subscription' = 'all';
    bookSource: 'internal' | 'external' = 'internal'; // Toggle for merged books tab
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

        // Check login status
        const isLoggedIn = this.authService.isLoggedIn();

        this.categories = this.ebookService.getCategories();
        this.updateUnifiedCategories();

        if (isLoggedIn) {
            this.subscriptionService.refreshStatus();
            // Subscribe to subscription status changes
            const sub = this.subscriptionService.subscriptionStatus$.subscribe(status => {
                this.subscription = status;
                if (status) {
                    this.loadSubscriptionHistory();
                }
            });
            this.subscriptions.push(sub);
        }

        this.loadData();
        this.loadExternalData();

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
            this.updateUnifiedGrid(); // Fix: Update UI for "Read" button
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
                console.log('KENOUZ DEBUG: Internal Ebooks API Response:', response);
                if (append) this.ebooks = [...this.ebooks, ...response.data];
                else this.ebooks = response.data;

                console.log('KENOUZ DEBUG: Current Internal Ebooks loaded:', this.ebooks.length);

                this.totalBooks = response.total;
                this.hasMoreBooks = this.ebooks.length < this.totalBooks;
                this.applyFilters(); // Consolidating filters
                this.isLoading = false;
                this.isLoadingMore = false;
            },
            error: (err) => {
                console.error('Error loading ebooks:', err);
                if (!append) this.handleOfflineLoad();
                else { this.isLoading = false; this.isLoadingMore = false; }
            }
        });

        if (!append && this.authService.isLoggedIn()) {
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
                this.updateUnifiedCategories();
                this.applyExternalFilters(); // Apply current filters (search/cat) immediately
            },
            error: (err) => console.error('Failed to load external books', err)
        });
    }

    private updateUnifiedCategories() {
        // Map internal keys to display names
        const internalDisplayNames = this.categories.map(c => this.getCategoryName(c));

        // Merge and dedup
        const unique = new Set([...internalDisplayNames, ...this.externalCategories]);
        this.allCategories = Array.from(unique).sort();
    }

    // --- Unified Logic ---

    // Called whenever internal or external filtered lists change
    private updateUnifiedGrid() {
        // Map Internal
        const internalUnified: UnifiedBook[] = this.filteredEbooks.map(book => ({
            id: book._id,
            title: book.title,
            author: book.author,
            coverUrl: this.getCoverImageUrl(book),
            category: this.getCategoryName(book.category),
            source: 'internal',
            rating: book.averageRating || 4.5,
            isFree: book.price === 0,
            originalObject: book, // Keep ref
            isDownloaded: this.isInternalBookDownloaded(book),
            isDownloading: this.isInternalBookDownloading(book),
            downloadProgress: this.isInternalBookDownloading(book) ? this.getInternalDownloadProgress(book) : 0
        }));

        // Map External
        const externalUnified: UnifiedBook[] = this.paginatedExternalBooks.map(book => ({
            id: String(book.id),
            title: book.title,
            author: book.author,
            coverUrl: 'assets/images/defaults/book_cover_placeholder.png', // Or dynamic 
            category: book.category,
            source: 'external',
            rating: undefined,
            isFree: true,
            originalObject: book,
            isDownloaded: this.downloadedBooks.has(book.id),
            isDownloading: !!this.getDownloadState(book.id),
            downloadProgress: this.getDownloadState(book.id)?.progress || 0
        }));

        // Merge
        let combined = [...internalUnified, ...externalUnified];

        // Sort (Interleave by Title)
        combined.sort((a, b) => a.title.localeCompare(b.title, 'ar'));

        this.unifiedBooks = combined;
        console.log('KENOUZ DEBUG: Updated Unified Grid. Total:', combined.length, 'Internal:', internalUnified.length, 'External:', externalUnified.length);
    }

    // Unified Load More
    loadMoreUnified() {
        this.isLoadingMore = true;

        // 1. Load more internal
        if (this.hasMoreBooks) {
            this.loadMore(); // This appends to ebooks/filteredEbooks
        }

        // 2. Load more external (Advance page)
        if (this.externalCurrentPage < this.totalExternalPages) {
            this.externalCurrentPage++;

            const currentEnd = this.externalCurrentPage * this.externalItemsPerPage;
            this.paginatedExternalBooks = this.filteredExternalBooks.slice(0, currentEnd);
        }

        setTimeout(() => {
            this.updateUnifiedGrid();
            this.isLoadingMore = false;
        }, 500);
    }

    openExternalBook(book: any) {
        this.downloadExternalBook(book);
    }

    // Internal Helper for downloading state check
    getInternalDownloadProgress(book: Ebook): number {
        const state = this.internalDownloadStates[book._id];
        return state ? state.progress : 0;
    }

    applyFilters(): void {
        let filtered = [...this.ebooks];
        console.log('KENOUZ DEBUG: applyFilters Start. Ebooks Total:', this.ebooks.length);

        // ViewMode Logic
        if (this.viewMode === 'favorites') {
            filtered = filtered.filter(e => this.isFavorite(e));
        } else if (this.viewMode === 'owned') {
            filtered = filtered.filter(e => this.ownedEbookIds.has(e._id));
        } else if (this.viewMode === 'subscription') {
            // Show books available for subscription (assuming property exists or logic)
            // If property doesn't exist on Ebook interface, we might need a different check
            // Based on previous code in Step 2839, it used 'availableForSubscription'
            filtered = filtered.filter(e => e.availableForSubscription);
        }
        console.log('KENOUZ DEBUG: After ViewMode Filter:', filtered.length, 'Mode:', this.viewMode);

        // Search Filter
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.title.toLowerCase().includes(q) ||
                e.author.toLowerCase().includes(q)
            );
            console.log('KENOUZ DEBUG: After Search Filter:', filtered.length, 'Query:', q);
        }

        // Category Filter
        if (this.selectedCategory) {
            filtered = filtered.filter(e => this.getCategoryName(e.category) === this.selectedCategory);
            console.log('KENOUZ DEBUG: After Category Filter:', filtered.length, 'Cat (Display):', this.selectedCategory, 'Sample Cat (Raw):', this.ebooks[0]?.category);
        }

        this.filteredEbooks = filtered;
        console.log('KENOUZ DEBUG: Final Filtered Ebooks:', this.filteredEbooks.length);
        this.updateUnifiedGrid(); // Trigger Merge
    }

    applyExternalFilters(): void {
        let filtered = this.externalBooks;

        // ViewMode Logic for External
        if (this.viewMode === 'favorites') {
            filtered = filtered.filter(b => this.isExternalFavorite(b));
        } else if (this.viewMode === 'owned') {
            // External books are "owned" if downloaded? Or just always available?
            // "Owned" usually means purchased. External are free. 
            // Maybe show downloaded ones? Or nothing?
            // Let's match "showDownloadedOnly" behavior or just show all since they are "free"?
            // User context: "Subscription (Favorites and Subscription) do not display correct items"
            // If I am in Subscription mode, I probably don't want to see External books (they are not "subscription" content).
            // If I am in Owned mode, maybe downloaded?
            if (this.showDownloadedOnly) {
                filtered = filtered.filter(b => this.downloadedBooks.has(b.id));
            }
        } else if (this.viewMode === 'subscription') {
            // External books are NOT part of subscription (they are free). 
            // So we should probably hide them to avoid confusion, or show them as they are "free access"?
            // If the user says "Favorites and Subscription do not display correct items", they probably expect strict filtering.
            // Let's exclude external books in Subscription mode for now to be distinct.
            filtered = [];
        }

        if (this.selectedCategory) filtered = filtered.filter(b => b.category === this.selectedCategory);
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
        }

        if (this.showDownloadedOnly) {
            filtered = filtered.filter(b => this.downloadedBooks.has(b.id));
        }

        this.filteredExternalBooks = filtered;
        this.externalTotalItems = filtered.length;
        this.externalCurrentPage = 1;
        this.updateExternalPagination();
        this.updateUnifiedGrid(); // Trigger Merge
    }

    updateExternalPagination() {
        const end = this.externalCurrentPage * this.externalItemsPerPage;
        this.paginatedExternalBooks = this.filteredExternalBooks.slice(0, end);
    }

    onExternalPageChange(page: number) {
        if (page >= 1 && page <= this.totalExternalPages) {
            this.externalCurrentPage = page;
            this.updateExternalPagination();
            this.updateUnifiedGrid(); // Trigger Merge
        }
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
    setActiveTab(tab: 'books' | 'achievements' | 'downloads') {
        this.activeTab = tab;
        this.selectedCategory = '';
        this.searchQuery = '';
    }

    setDownloadsTab(tab: 'downloads' | 'favorites') { this.downloadsTab = tab; }

    onSearch(): void {
        // Update both to ensure persistence when switching
        this.loadData(false);
        this.applyExternalFilters();
    }

    onCategoryChange(): void {
        // Update both
        this.loadData(false);
        this.applyExternalFilters();
    }
    toggleDownloadedFilter(): void { this.showDownloadedOnly = !this.showDownloadedOnly; this.applyExternalFilters(); }
    loadMore(): void { if (!this.hasMoreBooks || this.isLoadingMore) return; this.currentPage++; this.loadData(true); }

    setViewMode(mode: 'all' | 'owned' | 'favorites' | 'subscription'): void {
        this.viewMode = mode;
        this.applyFilters();
        this.applyExternalFilters();
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

    async downloadInvoice(targetSub?: any) {
        const item = targetSub || this.subscription;
        if (!item) return;

        this.isLoading = true;

        try {
            // 1. Get the template
            const template = document.getElementById('invoice-template');
            if (!template) {
                console.error('Invoice template not found');
                alert('خطأ: قالب الفاتورة غير موجود');
                return;
            }

            // 2. Prepare Data
            const userStr = localStorage.getItem('user');
            let userName = 'عميل كنوز';
            let userEmail = '';
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    userName = user.name || user.username || 'عميل كنوز';
                    userEmail = user.email || '';
                } catch (e) { }
            }

            // Handle different object structures (Subscription vs History Item)
            const planName = (item.plan === 'monthly' || item.plan === 'شهري') ? 'اشتراك شهري Premium' : 'اشتراك سنوي VIP';
            const price = item.price || (item.plan === 'monthly' ? 50 : 500);

            // Generate deterministic ID
            const dateObj = new Date(item.startDate || item.date || new Date());
            const timestamp = dateObj.getTime();
            const invoiceId = `INV-${timestamp.toString().slice(-6)}`;
            const dateStr = dateObj.toLocaleDateString('ar-EG');
            const paymentRef = `TXN-${Math.abs(timestamp).toString(36).toUpperCase()}`;
            const duration = (item.plan === 'monthly' || item.plan === 'شهري') ? '30 يوم / days' : '365 يوم / days';

            // 3. Inject Data
            const setText = (id: string, text: string) => {
                const el = document.getElementById(id);
                if (el) el.innerText = text;
            }

            setText('invoice-user-name', userName);
            setText('invoice-user-email', userEmail);
            setText('invoice-id', invoiceId);
            setText('invoice-date', dateStr);
            setText('invoice-plan-name', planName);
            setText('invoice-price', `${price} EGP`);
            setText('invoice-subtotal', `${price} EGP`);
            setText('invoice-total', `${price} EGP`);
            setText('invoice-payment-ref', paymentRef);
            setText('invoice-qr-id', invoiceId);
            setText('invoice-duration', duration);

            // 4. Import & Capture
            const { jsPDF } = await import('jspdf');
            const html2canvas = (await import('html2canvas')).default;

            // Make visible for capture
            const originalOpacity = template.style.opacity;
            const originalZIndex = template.style.zIndex;

            template.style.opacity = '1';
            template.style.zIndex = '9999';
            template.style.backgroundColor = 'white';

            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 250));

            const canvas = await html2canvas(template as HTMLElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: 794 // A4 width @ 96dpi
            });

            // Restore hidden state
            template.style.opacity = originalOpacity;
            template.style.zIndex = originalZIndex;

            // 5. Generate PDF
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

            const fileName = `فاتورة_ضريبية_${invoiceId}.pdf`;

            if (Capacitor.isNativePlatform()) {
                // Native: Save to fs and Share
                const base64Data = pdf.output('datauristring').split(',')[1];

                try {
                    const savedFile = await Filesystem.writeFile({
                        path: fileName,
                        data: base64Data,
                        directory: Directory.Cache
                    });

                    await Share.share({
                        title: 'فاتورة اشتراك كنوز بوك',
                        text: `إليك فاتورة الاشتراك رقم ${invoiceId}`,
                        url: savedFile.uri,
                        dialogTitle: 'تحميل الفاتورة'
                    });
                } catch (nativeErr) {
                    console.error('Native save/share failed', nativeErr);
                    alert('عذراً، حدث خطأ أثناء حفظ الملف على الهاتف.');
                }
            } else {
                pdf.save(fileName);
            }

        } catch (error) {
            console.error('Error generating invoice:', error);
            alert('حدث خطأ أثناء إنشاء الفاتورة. يرجى المحاولة مرة أخرى.');
        } finally {
            this.isLoading = false;
        }
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

        // UI Update: Immediate Feedback
        const targetBook = this.unifiedBooks.find(b => b.id === book.id);
        if (targetBook) {
            targetBook.isDownloading = true;
            targetBook.downloadProgress = 0;
        }

        this.downloadManager.downloadAndProcessBook(
            book.id,
            book.downloadUrl,
            { title: book.title, author: book.author, category: book.category }
        ).subscribe({
            next: (progress) => {
                this.downloadStates[book.id] = progress;

                // UI Update: Real-time progress
                const currentBook = this.unifiedBooks.find(b => b.id === book.id);
                if (currentBook) {
                    currentBook.downloadProgress = progress.progress;
                    if (progress.state === 'DONE') {
                        currentBook.isDownloading = false;
                        currentBook.isDownloaded = true;
                    }
                }

                // If done, mark as ready
                if (progress.state === 'DONE') {
                    this.downloadedBooks.add(book.id);
                    this.updateUnifiedGrid(); // Refresh grid state
                }
            },
            error: (err) => {
                console.error('Download error', err);
                this.downloadStates[book.id] = { state: 'ERROR', progress: 0, error: 'فشل التحميل' };

                // Reset UI
                const currentBook = this.unifiedBooks.find(b => b.id === book.id);
                if (currentBook) {
                    currentBook.isDownloading = false;
                    currentBook.downloadProgress = 0;
                }
            }
        });
    }

    // 5. Async Check for Availability
    async checkBookAvailability(bookId: string) {
        if (this.downloadManager && await this.downloadManager.isBookAvailable(bookId)) {
            this.downloadedBooks.add(bookId);
        }
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
        } finally {
            this.updateUnifiedGrid(); // Ensure grid reflects downloaded status
        }
    }

    downloadInternalBook(ebook: Ebook, event: Event) {
        event.stopPropagation(); // Prevent opening book

        if (this.downloadedInternalBooks.has(ebook._id)) return;
        if (this.internalDownloadStates[ebook._id]) return;

        this.internalDownloadStates[ebook._id] = { state: 'PENDING', progress: 0 };

        // Update UI immediately
        const unifiedBook = this.unifiedBooks.find(b => b.id === ebook._id);
        if (unifiedBook) {
            unifiedBook.isDownloading = true;
            unifiedBook.downloadProgress = 0;
        }

        this.offlineEbookService.downloadBookWithProgress(ebook._id, ebook).subscribe({
            next: (status) => {
                this.internalDownloadStates[ebook._id] = status;

                // Update UI Real-time
                const currentBook = this.unifiedBooks.find(b => b.id === ebook._id);
                if (currentBook) {
                    currentBook.downloadProgress = status.progress;
                    if (status.state === 'DONE') {
                        currentBook.isDownloading = false;
                        currentBook.isDownloaded = true;
                    }
                }

                if (status.state === 'DONE') {
                    this.downloadedInternalBooks.add(ebook._id);
                    this.internalDownloadStates[ebook._id] = null; // Clear tracking
                    this.updateTotalDownloadsCount();
                    // Force grid refresh to ensure consistency
                    this.updateUnifiedGrid();
                }
            },
            error: (err) => {
                console.error('Download failed', err);
                this.internalDownloadStates[ebook._id] = null;

                const currentBook = this.unifiedBooks.find(b => b.id === ebook._id);
                if (currentBook) {
                    currentBook.isDownloading = false;
                    currentBook.downloadProgress = 0;
                }
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



}
