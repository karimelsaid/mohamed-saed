import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common'; 
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription as RxSubscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
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
import { SpecialOffersService, WhitelistedOffer } from '../services/special-offers.service';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ReadingChallengeModalComponent } from '../shared/reading-challenge-modal/reading-challenge-modal.component';
import { ReadingChallengeService } from '../services/reading-challenge.service';
import { ChallengeDetailsModalComponent } from '../shared/challenge-details-modal/challenge-details-modal.component';

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
    createdAt: Date; // Added for sorting
}

@Component({
    selector: 'app-library',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DownloadsComponent, GamificationDashboardComponent, FontAwesomeModule, ReadingChallengeModalComponent, ChallengeDetailsModalComponent],
    templateUrl: './library.component.html',
    styleUrls: ['./library.component.css']
})
export class LibraryComponent implements OnInit, OnDestroy {
    @ViewChild('searchInput') searchInput!: ElementRef;
    @ViewChild(ReadingChallengeModalComponent) readingChallengeModal?: ReadingChallengeModalComponent;
    @ViewChild(ChallengeDetailsModalComponent) challengeDetailsModal?: ChallengeDetailsModalComponent;
    
    // Internal Books State
    ebooks: Ebook[] = [];
    allLoadedEbooks: Ebook[] = []; // Cache of all loaded books for instant client-side search
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
    activeTab: 'books' | 'achievements' | 'downloads' | 'challenges' = 'books';
    downloadsTab: 'downloads' | 'favorites' = 'downloads';
    subscription: Subscription | null = null;
    subscriptionHistory: Subscription[] = [];
    isLoading = true;
    isInternalLoading = true; // Premium tracking to prevent BOK drowning out EPUB during load
    error: string | null = null;



    // --- Unified Data Interface ---
    unifiedBooks: UnifiedBook[] = [];

    // Curated Abjad-style shelves properties
    recentlyAddedEbooks: UnifiedBook[] = [];
    mostDownloadedEbooks: UnifiedBook[] = [];
    mostReadEbooks: UnifiedBook[] = [];
    featuredEbooks: UnifiedBook[] = [];
    bookOfTheDay: UnifiedBook | null = null;
    
    // Challenges State
    myChallenges: any[] = [];
    publicChallenges: any[] = [];

    categories: string[] = [];
    allCategories: string[] = []; // Unified list

    // UI Filters
    selectedCategory: string = '';
    searchQuery: string = '';
    viewMode: 'all' | 'owned' | 'favorites' | 'subscription' = 'all';
    bookSource: 'internal' | 'external' = 'internal'; // Toggle for merged books tab
    showDownloadedOnly: boolean = false;
    
    // Sidebar Advanced Filters
    selectedLanguage: string = ''; // '', 'ar', 'en'
    selectedPriceMode: string = ''; // '', 'free', 'paid'
    selectedRating: number = 0; // 0 for all, 1,2,3,4,5 min rating

    // Pagination State (Internal)
    currentPage: number = 1;
    itemsPerPage: number = 24; // Reduced from 100 for instant initial load
    totalBooks: number = 0;
    hasMoreBooks: boolean = false;
    isLoadingMore: boolean = false;

    // Special Offer State
    showSurpriseModal = false;
    currentOffer: WhitelistedOffer | null = null;

    // Quick View State
    quickViewBook: UnifiedBook | null = null;
    showQuickViewModal = false;

    // Shared Book State (for /library/:bookId route)
    private sharedBookId: string | null = null;
    private sharedBookHandled = false;

    private uploadsBaseUrl = environment.uploadsBaseUrl;
    private subscriptions: RxSubscription[] = [];
    private searchSubject = new Subject<string>();

    constructor(
        private ebookService: EbookService,
        private subscriptionService: SubscriptionService,
        private userLibraryService: UserLibraryService,
        public authService: AuthService,
        private readingChallengeService: ReadingChallengeService,
        private offlineEbookService: OfflineEbookService,
        private externalLibraryService: ExternalLibraryService,
        private downloadManager: DownloadManagerService,
        private specialOffersService: SpecialOffersService,
        private router: Router,
        private route: ActivatedRoute,
        private cdr: ChangeDetectorRef,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    ngOnInit(): void {
        this.route.queryParams.subscribe(params => {
            if (params['tab']) {
                this.setActiveTab(params['tab']);
            }
        });

        // Check for shared book ID from /library/:bookId route
        this.route.params.subscribe(params => {
            if (params['bookId']) {
                this.sharedBookId = params['bookId'];
                this.sharedBookHandled = false;
            }
        });

        // Check login status (only in browser to avoid SSR issues with auth state)
        let isLoggedIn = false;
        if (isPlatformBrowser(this.platformId)) {
            isLoggedIn = this.authService.isLoggedIn();
        }

        this.ebookService.fetchAdminCategories().subscribe({
            next: (cats) => {
                if (cats && cats.length > 0) {
                    this.categories = cats.map(c => c.value);
                } else {
                    this.categories = this.ebookService.getCategories();
                }
                this.updateUnifiedCategories();
            },
            error: () => {
                this.categories = this.ebookService.getCategories();
                this.updateUnifiedCategories();
            }
        });

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
            
            // Load challenges immediately if logged in
            this.loadMyChallenges();
            
            // Check for Special Offers (Surprise!)
            if (isPlatformBrowser(this.platformId)) {
                this.checkForSpecialOffers();
            }
        }

        if (isPlatformBrowser(this.platformId)) {
            this.loadData();
            this.loadExternalData();
        } else {
            // SSR Fallback
            this.isLoading = false;
            this.isInternalLoading = false;
        }

        if (isPlatformBrowser(this.platformId)) {
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

            // Debounced backend search (only fires after 500ms of no typing)
            const searchSub = this.searchSubject.pipe(
                debounceTime(500),
                distinctUntilChanged()
            ).subscribe(query => {
                this.loadData(false); // Fetch from backend with the search query
            });
            this.subscriptions.push(searchSub);
        }
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

    private checkForSpecialOffers() {
        this.specialOffersService.checkMyOffer().subscribe({
            next: (res) => {
                if (res.success && res.hasOffer && res.data) {
                    this.currentOffer = res.data;
                    this.showSurpriseModal = true;
                }
            },
            error: (err) => console.error('Error checking offers', err)
        });
    }

    closeSurpriseModal() {
        this.showSurpriseModal = false;
        if (this.currentOffer) {
            this.specialOffersService.acknowledgeOffer().subscribe(() => {
                this.subscriptionService.refreshStatus(); // Refresh UI to show active sub
            });
        }
    }

    getOfferDescription(offer: WhitelistedOffer | null): string {
        if (!offer) return '';
        switch (offer.type) {
            case 'lifetime': return 'وصول مدى الحياة مجاناً لكل الكتب الإلكترونية';
            case 'free_months': return `اشتراك مجاني بالكامل لمدة ${offer.value} شهر`;
            case 'free_days': return `اشتراك مجاني بالكامل لمدة ${offer.value} يوم`;
            case 'discount': return `خصم خاص بنسبة ${offer.value}% على الورقي والاشتراكات`;
            default: return '';
        }
    }

    getOfferIcon(type: string | undefined): any {
        switch (type) {
            case 'lifetime': return ['fas', 'crown'];
            case 'discount': return ['fas', 'percent'];
            default: return ['fas', 'gift'];
        }
    }

    // --- Internal Books Logic ---
    loadData(append: boolean = false): void {
        if (append) {
            this.isLoadingMore = true;
        } else {
            // Don't wipe ebooks list here - keep showing current results while API loads
            if (this.ebooks.length === 0) {
                this.isLoading = true;
                this.isInternalLoading = true;
            }
            this.currentPage = 1;

            // Offline First: Load locally cached books from IndexedDB immediately (within milliseconds)
            this.offlineEbookService.getCachedBooks().then(cachedBooks => {
                if (cachedBooks && cachedBooks.length > 0 && this.ebooks.length === 0) {
                    this.ebooks = cachedBooks;
                    this.allLoadedEbooks = [...cachedBooks];
                    cachedBooks.forEach(b => this.ownedEbookIds.add(b._id));
                    this.applyFilters();
                    
                    // Instantly hide full-page loader to make UI interactive
                    this.isLoading = false;
                    this.isInternalLoading = false;
                    this.cdr.markForCheck();
                    console.log('⚡ Offline First: Displayed cached books from IndexedDB instantly');
                }
            }).catch(err => console.error('Failed to load offline books cache', err));
        }

        const rawCategory = (this.selectedCategory && this.selectedCategory !== 'كل الكتب') ? this.getCategoryRawKey(this.selectedCategory) : '';
        const filters = { category: rawCategory, search: this.searchQuery };

        this.ebookService.getEbooks(filters, this.currentPage, this.itemsPerPage).subscribe({
            next: (response) => {
                console.log('KENOUZ DEBUG: Internal Ebooks API Response:', response);
                if (append) {
                    this.ebooks = [...this.ebooks, ...response.data];
                } else {
                    this.ebooks = response.data;
                }

                // Update the cache: merge new results with any previously loaded books
                if (!append) {
                    if (!this.searchQuery) {
                        this.allLoadedEbooks = [...this.ebooks];
                    } else {
                        // Merge backend results into cache (dedup by _id)
                        const existingIds = new Set(this.allLoadedEbooks.map(e => e._id));
                        response.data.forEach((e: Ebook) => {
                            if (!existingIds.has(e._id)) {
                                this.allLoadedEbooks.push(e);
                            }
                        });
                    }
                } else {
                    // Append mode: add new items to cache
                    const existingIds = new Set(this.allLoadedEbooks.map(e => e._id));
                    response.data.forEach((e: Ebook) => {
                        if (!existingIds.has(e._id)) {
                            this.allLoadedEbooks.push(e);
                        }
                    });
                }

                console.log('KENOUZ DEBUG: Current Internal Ebooks loaded:', this.ebooks.length, 'Cache:', this.allLoadedEbooks.length);

                this.totalBooks = response.total;
                this.hasMoreBooks = this.ebooks.length < this.totalBooks;
                this.applyFilters(); // Consolidating filters
                this.isLoading = false;
                this.isInternalLoading = false;
                this.isLoadingMore = false;
                this.cdr.markForCheck();

                // Auto-open shared book if navigated via /library/:bookId
                this.tryOpenSharedBook();
            },
            error: (err) => {
                console.error('Error loading ebooks:', err);
                if (!append) this.handleOfflineLoad();
                else { this.isLoading = false; this.isInternalLoading = false; this.isLoadingMore = false; }
            }
        });

        if (!append && this.authService.isLoggedIn()) {
            this.userLibraryService.getUserLibrary().subscribe({
                next: (response) => {
                    this.ownedEbookIds = new Set(response.data.map((item: any) => typeof item.ebookId === 'object' ? item.ebookId._id : item.ebookId));
                    this.applyFilters();
                },
                error: (err) => console.error('Error loading library:', err)
            });
        }
    }

    private handleOfflineLoad(): void {
        this.isLoading = true;
        this.isInternalLoading = true;
        this.offlineEbookService.getCachedBooks().then(books => {
            this.ebooks = books;
            this.filteredEbooks = books;
            this.isLoading = false;
            this.isInternalLoading = false;
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

    getBookStats(id: string): { downloads: number, views: number, rating: number } {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const absHash = Math.abs(hash);
        
        // Highly realistic stats:
        // downloads: 150 to 9800
        const downloads = 150 + (absHash % 9650);
        // views: downloads * (3 to 7) + up to 1200
        const views = downloads * (3 + (absHash % 5)) + (absHash % 1200);
        // rating: 3.8 to 4.9
        const rating = 3.8 + ((absHash % 12) / 10);
        
        return {
            downloads,
            views,
            rating: parseFloat(rating.toFixed(1))
        };
    }

    // --- Unified Logic ---

    // Called whenever internal or external filtered lists change
    private updateUnifiedGrid() {
        // Map Internal
        const internalUnified: UnifiedBook[] = this.filteredEbooks.map(book => {
            const stats = this.getBookStats(book._id);
            const realDownloads = book.downloadCount || stats.downloads;
            const realViews = book.viewCount || stats.views;
            const realRating = book.averageRating || stats.rating;
            
            return {
                id: book._id,
                title: book.title,
                author: book.author,
                coverUrl: this.getCoverImageUrl(book),
                category: this.getCategoryName(book.category),
                source: 'internal',
                rating: realRating,
                isFree: book.price === 0,
                originalObject: book, // Keep ref
                isDownloaded: this.isInternalBookDownloaded(book),
                isDownloading: this.isInternalBookDownloading(book),
                downloadProgress: this.isInternalBookDownloading(book) ? this.getInternalDownloadProgress(book) : 0,
                createdAt: book.createdAt ? new Date(book.createdAt) : new Date(0),
                simDownloads: realDownloads,
                simViews: realViews
            };
        });

        // Map External
        const externalUnified: UnifiedBook[] = this.paginatedExternalBooks.map(book => ({
            id: String(book.id),
            title: book.title,
            author: book.author,
            coverUrl: 'assets/images/defaults/book_cover_placeholder.png', // Or dynamic 
            category: this.getCategoryName(book.category),
            source: 'external',
            rating: undefined,
            isFree: true,
            originalObject: book,
            isDownloaded: this.downloadedBooks.has(book.id),
            isDownloading: !!this.getDownloadState(book.id) && this.getDownloadState(book.id)?.state !== 'DONE',
            downloadProgress: this.getDownloadState(book.id)?.progress || 0,
            createdAt: (book as any).createdAt ? new Date((book as any).createdAt) : new Date(0)
        }));

        // Map All Internal Loaded Ebooks for Curated Showcases (static catalog analysis)
        const allInternalUnified: UnifiedBook[] = this.allLoadedEbooks.map(book => {
            const stats = this.getBookStats(book._id);
            const realDownloads = book.downloadCount || stats.downloads;
            const realViews = book.viewCount || stats.views;
            const realRating = book.averageRating || stats.rating;

            return {
                id: book._id,
                title: book.title,
                author: book.author,
                coverUrl: this.getCoverImageUrl(book),
                category: this.getCategoryName(book.category),
                source: 'internal',
                rating: realRating,
                isFree: book.price === 0,
                originalObject: book,
                isDownloaded: this.isInternalBookDownloaded(book),
                isDownloading: this.isInternalBookDownloading(book),
                downloadProgress: this.isInternalBookDownloading(book) ? this.getInternalDownloadProgress(book) : 0,
                createdAt: book.createdAt ? new Date(book.createdAt) : new Date(0),
                simDownloads: realDownloads,
                simViews: realViews
            };
        });

        // Compute Dynamic Curated Showcases
        this.recentlyAddedEbooks = [...allInternalUnified]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 10);

        this.mostDownloadedEbooks = [...allInternalUnified]
            .sort((a, b) => (b as any).simDownloads - (a as any).simDownloads)
            .slice(0, 10);

        this.mostReadEbooks = [...allInternalUnified]
            .sort((a, b) => (b as any).simViews - (a as any).simViews)
            .slice(0, 10);

        // Sort by highest rating descending
        this.featuredEbooks = [...allInternalUnified]
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 10);

        // Calculate a highly-rated Book of the Day once or update its state
        if (allInternalUnified.length > 0) {
            if (!this.bookOfTheDay) {
                const topRated = allInternalUnified.filter(b => b.rating && b.rating >= 4.5);
                const candidates = topRated.length > 0 ? topRated : allInternalUnified;
                const randIndex = Math.floor(Math.random() * candidates.length);
                this.bookOfTheDay = candidates[randIndex];
            } else {
                // Keep the reference synchronized with the latest state (isDownloaded, isDownloading, progress)
                const latestState = allInternalUnified.find(b => b.id === this.bookOfTheDay!.id);
                if (latestState) {
                    this.bookOfTheDay = latestState;
                }
            }
        }

        // Merge
        let combined = [...internalUnified, ...externalUnified];

        // Sort (Newest First)
        combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        this.unifiedBooks = combined;
        console.log('KENOUZ DEBUG: Updated Unified Grid. Total:', combined.length, 'Internal:', internalUnified.length, 'External:', externalUnified.length, 'Showcase size:', allInternalUnified.length);
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
        // Use cached books for client-side search to enable instant partial matching
        let source = this.searchQuery ? this.allLoadedEbooks : this.ebooks;
        let filtered = [...source];
        console.log('KENOUZ DEBUG: applyFilters Start. Source:', source.length, 'Search:', this.searchQuery);

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
                (e.title && e.title.toLowerCase().includes(q)) ||
                (e.author && e.author.toLowerCase().includes(q))
            );
            console.log('KENOUZ DEBUG: After Search Filter:', filtered.length, 'Query:', q);
        }

        // Category Filter
        if (this.selectedCategory && this.selectedCategory !== 'كل الكتب') {
            filtered = filtered.filter(e => this.getCategoryName(e.category) === this.selectedCategory);
            console.log('KENOUZ DEBUG: After Category Filter:', filtered.length, 'Cat (Display):', this.selectedCategory, 'Sample Cat (Raw):', this.ebooks[0]?.category);
        }

        // Advanced Sidebar Filters
        if (this.selectedLanguage) {
            // Assume e.language might be 'ar', 'en', 'arabic', etc. Adjust safely
            filtered = filtered.filter(e => e.language && e.language.toLowerCase().startsWith(this.selectedLanguage));
        }

        if (this.selectedPriceMode === 'free') {
            filtered = filtered.filter(e => !e.price || e.price === 0);
        } else if (this.selectedPriceMode === 'paid') {
            filtered = filtered.filter(e => e.price && e.price > 0);
        }

        if (this.selectedRating > 0) {
            filtered = filtered.filter(e => {
                const stats = this.getBookStats(e._id);
                const realRating = e.averageRating || stats.rating;
                return realRating >= this.selectedRating;
            });
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

        if (this.selectedCategory && this.selectedCategory !== 'كل الكتب') filtered = filtered.filter(b => b.category === this.selectedCategory);
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(b =>
                (b.title && b.title.toLowerCase().includes(q)) ||
                (b.author && b.author.toLowerCase().includes(q))
            );
        }

        if (this.showDownloadedOnly) {
            filtered = filtered.filter(b => this.downloadedBooks.has(b.id));
        }

        // Advanced Sidebar Filters (External are free, mostly no language/rating guarantees)
        if (this.selectedPriceMode === 'paid') {
            filtered = []; // All external books are free
        }
        if (this.selectedRating > 0) {
            filtered = []; // External books usually don't have ratings mapped
        }

        this.filteredExternalBooks = filtered;
        this.externalTotalItems = filtered.length;
        this.externalCurrentPage = 1;
        this.updateExternalPagination();
        this.updateUnifiedGrid(); // Trigger Merge
    }

    setAdvancedFilter(type: 'language' | 'price' | 'rating', value: any): void {
        if (type === 'language') this.selectedLanguage = value;
        else if (type === 'price') this.selectedPriceMode = value;
        else if (type === 'rating') this.selectedRating = value;
        
        this.applyFilters();
        this.applyExternalFilters();
        
        // Scroll to results slightly
        const element = document.querySelector('.library-header-info');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    clearAdvancedFilters(): void {
        this.selectedLanguage = '';
        this.selectedPriceMode = '';
        this.selectedRating = 0;
        this.applyFilters();
        this.applyExternalFilters();
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

    // --- Quick View Modal Logic ---
    openQuickView(book: UnifiedBook, event: Event) {
        event.stopPropagation();
        this.quickViewBook = book;
        this.showQuickViewModal = true;
    }

    closeQuickView() {
        this.showQuickViewModal = false;
        setTimeout(() => this.quickViewBook = null, 300); // clear after animation
    }

    /**
     * Tries to open the shared book's Quick View modal.
     * Called after data loads when navigated via /library/:bookId.
     * If the book is already in the loaded list, opens it directly.
     * Otherwise, fetches it from the API.
     */
    private tryOpenSharedBook() {
        if (!this.sharedBookId || this.sharedBookHandled) return;

        // First check if the book is already in the unified grid
        const found = this.unifiedBooks.find(b => b.id === this.sharedBookId);
        if (found) {
            this.sharedBookHandled = true;
            setTimeout(() => this.openQuickView(found, new MouseEvent('click')), 300);
            return;
        }

        // Also check allLoadedEbooks
        const foundInCache = this.allLoadedEbooks.find(b => b._id === this.sharedBookId);
        if (foundInCache) {
            this.sharedBookHandled = true;
            const mapped: UnifiedBook = {
                id: foundInCache._id,
                title: foundInCache.title,
                author: foundInCache.author,
                coverUrl: this.getCoverImageUrl(foundInCache),
                category: this.getCategoryName(foundInCache.category),
                source: 'internal',
                rating: foundInCache.averageRating,
                isFree: foundInCache.price === 0,
                originalObject: foundInCache,
                isDownloaded: this.isInternalBookDownloaded(foundInCache),
                isDownloading: this.isInternalBookDownloading(foundInCache),
                downloadProgress: 0,
                createdAt: foundInCache.createdAt ? new Date(foundInCache.createdAt) : new Date(0)
            };
            setTimeout(() => this.openQuickView(mapped, new MouseEvent('click')), 300);
            return;
        }

        // Fetch from API if not found locally
        this.sharedBookHandled = true;
        this.ebookService.getEbookById(this.sharedBookId).subscribe({
            next: (res) => {
                if (res.success && res.data) {
                    const book = res.data;
                    const mapped: UnifiedBook = {
                        id: book._id,
                        title: book.title,
                        author: book.author,
                        coverUrl: this.getCoverImageUrl(book),
                        category: this.getCategoryName(book.category),
                        source: 'internal',
                        rating: book.averageRating,
                        isFree: book.price === 0,
                        originalObject: book,
                        isDownloaded: this.isInternalBookDownloaded(book),
                        isDownloading: false,
                        downloadProgress: 0,
                        createdAt: book.createdAt ? new Date(book.createdAt) : new Date(0)
                    };
                    this.openQuickView(mapped, new MouseEvent('click'));
                }
            },
            error: (err) => console.error('Error fetching shared book:', err)
        });
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
    setActiveTab(tab: 'books' | 'achievements' | 'downloads' | 'challenges') {
        this.activeTab = tab;
        this.selectedCategory = '';
        this.searchQuery = '';
        
        // Smooth scroll to top when changing tabs
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    setDownloadsTab(tab: 'downloads' | 'favorites') { this.downloadsTab = tab; }

    handleSearchInput(): void {
        // Get value directly from DOM element to preserve spaces exactly
        const inputElement = document.getElementById('librarySearchInput') as HTMLInputElement;
        if (inputElement) {
            this.searchQuery = inputElement.value;
        }

        // 1. Instant client-side filtering (no API call, no delay)
        this.applyFilters();
        this.applyExternalFilters();

        // 2. Debounced backend call for more/better results
        this.searchSubject.next(this.searchQuery);
    }

    onSearch(event?: any): void {
        // Get value directly from input element to preserve spaces
        if (event && event.target) {
            this.searchQuery = event.target.value;
        }

        // 1. Instant client-side filtering (no API call, no delay)
        this.applyFilters();
        this.applyExternalFilters();

        // 2. Debounced backend call for more/better results
        this.searchSubject.next(this.searchQuery);
    }

    selectCategory(cat: string) {
        this.selectedCategory = cat;
        this.onCategoryChange();
        
        // Smooth scroll to results
        const element = document.querySelector('.library-header-info');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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

    getCategoryRawKey(displayName: string): string {
        const categories = this.ebookService.getCategories();
        for (const cat of categories) {
            if (this.ebookService.getCategoryDisplayName(cat) === displayName) {
                return cat;
            }
        }
        return displayName;
    }

    hasAccess(ebook: Ebook): boolean { return true; } // Allow access
    isOwned(ebook: Ebook): boolean { return this.ownedEbookIds.has(ebook._id); }
    isFavorite(ebook: Ebook): boolean { return this.offlineEbookService.isLocalFavorite(ebook._id); }

    // Arabic character normalization for flexible search
    private normalizeArabic(text: string): string {
        return text
            .replace(/[أإآ]/g, 'ا')
            .replace(/[هة]/g, 'ه')
            .replace(/[ىي]/g, 'ي')
            .replace(/[^0-9a-zA-Z\u0600-\u06FF\s]/g, '');
    }

    toggleFavorite(ebook: Ebook, event: Event): void {
        event.preventDefault(); event.stopPropagation();
        if (this.isFavorite(ebook)) this.offlineEbookService.removeLocalFavorite(ebook._id);
        else this.offlineEbookService.addLocalFavorite(ebook._id);
    }

    isFree(ebook: Ebook): boolean { return ebook.price === 0; }

    handleImageError(event: any) {
        event.target.src = 'assets/image/book-placeholder.jpg';
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
        if (!ebook.coverImage) return '';
        if (ebook.coverImage.startsWith('data:')) return ebook.coverImage;
        if (ebook.coverImage.startsWith('http')) return ebook.coverImage;
        
        const baseUrl = this.uploadsBaseUrl.split('/uploads')[0];
        
        if (ebook.coverImage.startsWith('uploads/')) {
            return `${baseUrl}/${ebook.coverImage}`;
        }
        
        // Fallback for just filenames
        return `${baseUrl}/uploads/products/${ebook.coverImage}`;
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
        if (this.quickViewBook && this.quickViewBook.id === book.id) {
            this.quickViewBook.isDownloading = true;
            this.quickViewBook.downloadProgress = 0;
        }

        this.downloadManager.downloadAndProcessBook(
            book.id,
            book.downloadUrl,
            { title: book.title, author: book.author, category: book.category }
        ).subscribe({
            next: (progress) => {
                this.downloadStates[book.id] = progress;

                // UI Update: Real-time progress (Mutate existing without rebuilding entire grid)
                const currentBook = this.unifiedBooks.find(b => b.id === book.id);
                if (currentBook) {
                    currentBook.downloadProgress = progress.progress;
                    if (progress.state === 'DONE') {
                        currentBook.isDownloading = false;
                        currentBook.isDownloaded = true;
                    }
                }
                
                if (this.quickViewBook && this.quickViewBook.id === book.id) {
                    this.quickViewBook.isDownloading = progress.state !== 'DONE';
                    this.quickViewBook.downloadProgress = progress.progress;
                    if (progress.state === 'DONE') this.quickViewBook.isDownloaded = true;
                }

                // If done, mark as ready
                if (progress.state === 'DONE') {
                    this.downloadedBooks.add(book.id);
                    // Only rebuild grid when completely finished to avoid UI freezing
                    this.updateUnifiedGrid(); 
                }
            },
            error: (err) => {
                console.error('Download error', err);
                const errorMessage = err.message || (err.error && err.error.message) || 'خطأ غير معروف في الشبكة أو الخادم';
                alert('فشل تحميل الكتاب الخارجي. السبب: ' + errorMessage);
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

    async shareBook(book: any, event?: Event) {
        if (event) {
            event.stopPropagation();
        }
        
        let url = 'https://knoozbook.com/library';
        const bookId = book._id || book.id || book.bookId;
        
        if (book.source === 'internal' || bookId) {
             url = `https://knoozbook.com/library/${bookId}`;
        }
        
        const cleanUrl = decodeURIComponent(url);
        const text = `اقرأ كتاب "${book.title}" على مكتبة كنوز الرقمية\n${cleanUrl}`;
        
        try {
            if (typeof window !== 'undefined' && (window as any).Android && (window as any).Android.share) {
                (window as any).Android.share(text);
            } else if (navigator.share) {
                await navigator.share({
                    title: book.title,
                    text: text
                });
            } else {
                await Share.share({
                    title: book.title,
                    text: text,
                    dialogTitle: 'مشاركة الكتاب'
                });
            }
        } catch (err) {
            console.warn('Share cancelled or failed', err);
        }
    }

    createChallenge(book: any) {
        if (this.readingChallengeModal) {
            this.readingChallengeModal.bookId = book._id || book.id || (book.products_id ? book.products_id.toString() : '');
            this.readingChallengeModal.bookTitle = book.title;
            this.readingChallengeModal.bookCover = book.coverImage || book.products_image || '';
            this.readingChallengeModal.open();
        }
    }

    loadMyChallenges() {
        this.readingChallengeService.getMyChallenges().subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.myChallenges = res.data || [];
                    
                    // If no challenges, load public challenges to show them
                    if (this.myChallenges.length === 0) {
                        this.readingChallengeService.getAllPublicChallenges().subscribe({
                            next: (pubRes: any) => {
                                if (pubRes.success) {
                                    this.publicChallenges = pubRes.data || [];
                                }
                            }
                        });
                    }
                }
            },
            error: (err) => console.error('Failed to load challenges:', err)
        });
    }

    joinPublicChallenge(challengeId: string) {
        this.readingChallengeService.joinChallenge({ challengeId }).subscribe({
            next: (res: any) => {
                if (res.success) {
                    // Reload my challenges to reflect the new joined challenge
                    this.loadMyChallenges();
                }
            },
            error: (err: any) => {
                const msg = err.error?.message || 'حدث خطأ أثناء الانضمام للتحدي';
                alert(msg); // fallback to simple alert for now
            }
        });
    }

    viewChallenge(challenge: any) {
        if (this.challengeDetailsModal) {
            this.challengeDetailsModal.open(challenge);
        }
    }

    async downloadInternalBook(ebook: Ebook, event: Event) {
        if (event) { event.stopPropagation(); } // Prevent opening book

        if (this.downloadedInternalBooks.has(ebook._id)) return;
        if (this.internalDownloadStates[ebook._id]) return;

        this.internalDownloadStates[ebook._id] = { state: 'PENDING', progress: 0 };
        if (this.quickViewBook && this.quickViewBook.id === ebook._id) {
            this.quickViewBook.isDownloading = true;
            this.quickViewBook.downloadProgress = 0;
        }
        this.updateUnifiedGrid(); // Update UI immediately to show spinner/progress

        this.offlineEbookService.downloadBookWithProgress(ebook._id, ebook).subscribe({
            next: (status) => {
                this.internalDownloadStates[ebook._id] = status;

                // Mutate existing mapped objects instead of rebuilding the entire grid 50 times per second
                const mappedBook = this.unifiedBooks.find(b => b.id === ebook._id);
                if (mappedBook) {
                    mappedBook.isDownloading = status.state !== 'DONE';
                    mappedBook.downloadProgress = status.progress;
                    if (status.state === 'DONE') {
                        mappedBook.isDownloaded = true;
                    }
                }
                if (this.bookOfTheDay && this.bookOfTheDay.id === ebook._id) {
                    this.bookOfTheDay.isDownloading = status.state !== 'DONE';
                    this.bookOfTheDay.downloadProgress = status.progress;
                    if (status.state === 'DONE') this.bookOfTheDay.isDownloaded = true;
                }
                
                if (this.quickViewBook && this.quickViewBook.id === ebook._id) {
                    this.quickViewBook.isDownloading = status.state !== 'DONE';
                    this.quickViewBook.downloadProgress = status.progress;
                    if (status.state === 'DONE') this.quickViewBook.isDownloaded = true;
                }

                if (status.state === 'DONE') {
                    this.downloadedInternalBooks.add(ebook._id);
                    this.internalDownloadStates[ebook._id] = null; // Clear tracking
                    this.updateTotalDownloadsCount();
                    this.updateUnifiedGrid(); // Only rebuild once at the very end
                }
            },
            error: (err) => {
                console.error('Download failed', err);
                const errorMessage = err.message || (err.error && err.error.message) || 'خطأ غير معروف في الشبكة أو الخادم';
                alert('فشل تحميل الكتاب الداخلي. السبب: ' + errorMessage);
                this.internalDownloadStates[ebook._id] = null;
                
                const mappedBook = this.unifiedBooks.find(b => b.id === ebook._id);
                if (mappedBook) {
                    mappedBook.isDownloading = false;
                    mappedBook.downloadProgress = 0;
                }
                if (this.bookOfTheDay && this.bookOfTheDay.id === ebook._id) {
                    this.bookOfTheDay.isDownloading = false;
                    this.bookOfTheDay.downloadProgress = 0;
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
