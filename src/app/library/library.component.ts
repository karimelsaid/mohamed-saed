import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription as RxSubscription } from 'rxjs';
import { EbookService } from '../services/ebook.service';
import { SubscriptionService } from '../services/subscription.service';
import { UserLibraryService } from '../services/user-library.service';
import { AuthService } from '../auth/auth.service';
import { Ebook, Subscription } from '../models/ebook.model';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-library',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './library.component.html',
    styleUrls: ['./library.component.css']
})
export class LibraryComponent implements OnInit, OnDestroy {
    ebooks: Ebook[] = [];
    filteredEbooks: Ebook[] = [];
    ownedEbookIds: Set<string> = new Set();
    favoriteEbookIds: Set<string> = new Set();

    subscription: Subscription | null = null;
    isLoading = true;
    error: string | null = null;

    categories: string[] = [];
    selectedCategory: string = '';
    searchQuery: string = '';
    // Added 'favorites' view mode
    viewMode: 'all' | 'owned' | 'favorites' | 'subscription' = 'all';

    // Pagination State
    currentPage: number = 1;
    itemsPerPage: number = 20; // Or whatever backend default is
    totalBooks: number = 0;
    hasMoreBooks: boolean = false;
    isLoadingMore: boolean = false;

    private uploadsBaseUrl = environment.uploadsBaseUrl;

    private subscriptions: RxSubscription[] = [];

    constructor(
        private ebookService: EbookService,
        private subscriptionService: SubscriptionService,
        private userLibraryService: UserLibraryService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.categories = this.ebookService.getCategories();
        this.subscriptionService.refreshStatus();
        this.loadData();

        // Subscribe to subscription status changes
        const sub = this.subscriptionService.subscriptionStatus$.subscribe(status => {
            this.subscription = status;
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

        // Ensure favorites are loaded (if user is logged in)
        this.authService.user$.subscribe(user => {
            if (user && user.id) {
                this.authService.loadUserData(user.id);
            }
        });
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    // Load data, optionally appending to existing list
    loadData(append: boolean = false): void {
        if (append) {
            this.isLoadingMore = true;
        } else {
            this.isLoading = true;
            this.currentPage = 1; // Reset if not appending (new search/filter)
            this.ebooks = []; // Clear existing for fresh load
        }

        this.error = null;

        const filters = {
            category: this.selectedCategory,
            search: this.searchQuery
        };

        this.ebookService.getEbooks(filters, this.currentPage, this.itemsPerPage).subscribe({
            next: (response) => {
                console.log('📚 API Response:', response);

                if (append) {
                    this.ebooks = [...this.ebooks, ...response.data];
                } else {
                    this.ebooks = response.data;
                }

                this.totalBooks = response.total;
                // Check if current loaded count is less than total to determine if more exist
                this.hasMoreBooks = this.ebooks.length < this.totalBooks;

                this.applyFilters(); // Re-apply local view filters (owned/favs) 

                this.isLoading = false;
                this.isLoadingMore = false;
            },
            error: (err) => {
                console.error('❌ Error loading ebooks:', err);
                this.error = 'حدث خطأ في تحميل الكتب الإلكترونية';
                this.isLoading = false;
                this.isLoadingMore = false;
            }
        });

        // Note: User library calling remains separate but could be optimized. 
        // For simplicity, we keep loading 'owned' list fully to check ownership status locally.
        if (!append) {
            this.userLibraryService.getUserLibrary().subscribe({
                next: (response) => {
                    // Fix: accessing response.data and typing item as any to avoid implicit any error
                    this.ownedEbookIds = new Set(response.data.map((item: any) => typeof item.ebookId === 'object' ? item.ebookId._id : item.ebookId));
                },
                error: (err) => console.error('Error loading library:', err)
            });
        }
    }

    onSearch(): void {
        this.loadData(false); // Reset and reload
    }

    onCategoryChange(): void {
        this.loadData(false); // Reset and reload
    }

    loadMore(): void {
        if (!this.hasMoreBooks || this.isLoadingMore) return;
        this.currentPage++;
        this.loadData(true);
    }

    applyFilters(): void {
        let filtered = [...this.ebooks];

        // Category filter (redundant with server-side but kept for safety)
        if (this.selectedCategory) {
            filtered = filtered.filter(e => e.category === this.selectedCategory);
        }

        // Search filter (redundant with server-side but kept for safety)
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.title.toLowerCase().includes(query) ||
                e.author.toLowerCase().includes(query) ||
                e.description.toLowerCase().includes(query)
            );
        }

        // View mode filter
        if (this.viewMode === 'owned') {
            filtered = filtered.filter(e => this.ownedEbookIds.has(e._id));
        } else if (this.viewMode === 'subscription') {
            filtered = filtered.filter(e => e.availableForSubscription);
        } else if (this.viewMode === 'favorites') {
            filtered = filtered.filter(e => this.favoriteEbookIds.has(e._id));
        }

        console.log('📚 Filtered Ebooks:', filtered.length);
        this.filteredEbooks = filtered;
    }

    setViewMode(mode: 'all' | 'owned' | 'favorites' | 'subscription'): void {
        this.viewMode = mode;
        this.applyFilters();
    }

    formatFileSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    getRemainingDays(): number {
        return this.subscriptionService.getRemainingDays();
    }

    hasActiveSubscription(): boolean {
        return this.subscriptionService.hasActiveSubscription();
    }

    getPlanDisplayName(): string {
        if (!this.subscription) return '';
        return this.subscription.plan === 'yearly' ? 'الخطة السنوية' : 'الخطة الشهرية';
    }

    getSubscriptionEndDate(): Date | null {
        return this.subscription ? new Date(this.subscription.endDate) : null;
    }

    getBookDetailsLink(ebook: Ebook): any[] {
        const slug = ebook.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\-]+/g, '')
            .replace(/\-\-+/g, '-');

        return ['/book', ebook._id, slug];
    }

    getCategoryName(category: string): string {
        return this.ebookService.getCategoryDisplayName(category);
    }

    hasAccess(ebook: Ebook): boolean {
        // User has access if:
        // 1. They have an active subscription AND the book is available for subscription
        // 2. OR they own the book
        const hasSubscription = this.subscription && this.subscription.status === 'active' && ebook.availableForSubscription;
        const ownsBook = this.ownedEbookIds.has(ebook._id);
        return hasSubscription || ownsBook;
    }

    isOwned(ebook: Ebook): boolean {
        return this.ownedEbookIds.has(ebook._id);
    }

    isFavorite(ebook: Ebook): boolean {
        return this.favoriteEbookIds.has(ebook._id);
    }

    toggleFavorite(ebook: Ebook, event: Event): void {
        event.preventDefault();
        event.stopPropagation();

        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = userData.id;

        if (!userId) {
            // Check if we need to show login, for now just console log
            console.warn('User not logged in');
            return;
        }

        if (this.isFavorite(ebook)) {
            this.authService.removeFromFavorites(userId, ebook._id).subscribe({
                next: () => {
                    // Observable in auth service should update the state
                    const currentIds = this.authService.favoriteBookIds.getValue();
                    this.authService.favoriteBookIds.next(currentIds.filter(id => id !== ebook._id));
                },
                error: (err) => console.error('Error removing favorite', err)
            });
        } else {
            this.authService.addToFavorites(userId, ebook._id).subscribe({
                next: () => {
                    const currentIds = this.authService.favoriteBookIds.getValue();
                    this.authService.favoriteBookIds.next([...currentIds, ebook._id]);
                },
                error: (err) => console.error('Error adding favorite', err)
            });
        }
    }

    getCoverImageUrl(ebook: Ebook): string {
        if (ebook.coverImage?.startsWith('uploads/ebooks/')) {
            // Ebook covers are in /uploads/ebooks/
            return `/${ebook.coverImage}`;
        }
        if (ebook.coverImage?.startsWith('uploads/')) {
            return `${this.uploadsBaseUrl}/${ebook.coverImage}`;
        }
        // Return empty string if no image found, handled by template error or CSS
        return ebook.coverImage || '';
    }

    hasMiniVersion(ebook: any): boolean {
        return !!ebook.miniEpubFilePath;
    }
}
