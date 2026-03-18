import { Component, OnInit, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { CommunitySocialService } from '../../core/services/community-social.service';
import { AuthService } from '../../auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { ReaderPost } from '../../core/models/post.model';
import { BookSwap } from '../../core/models/book-swap.model';
import { 
    faArrowRight, faRss, faExchangeAlt, faHeart, 
    faComment, faBook, faStar, faQuoteRight, faPlus, 
    faSearch, faInfoCircle, faShareAlt, faSignInAlt, faTimes, faSyncAlt,
    faEllipsisV, faThumbtack, faTrash, faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import { AccountModalComponent } from '../../auth/account-modal/account-modal.component';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-reader-community',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule, AccountModalComponent],
    templateUrl: './reader-community.component.html',
    styleUrls: ['./reader-community.component.css']
})
export class ReaderCommunityComponent implements OnInit {
    faArrowRight = faArrowRight;
    faRss = faRss;
    faExchangeAlt = faExchangeAlt;
    faHeart = faHeart;
    faComment = faComment;
    faBook = faBook;
    faStar = faStar;
    faQuoteRight = faQuoteRight;
    faPlus = faPlus;
    faSearch = faSearch;
    faInfoCircle = faInfoCircle;
    faShareAlt = faShareAlt;
    faSignInAlt = faSignInAlt;
    faTimes = faTimes;
    faRefresh = faSyncAlt;
    faEllipsisV = faEllipsisV;
    faThumbtack = faThumbtack;
    faTrash = faTrash;
    faCheckCircle = faCheckCircle;

    activeMenuId: string | null = null;
    isHeaderVisible = true;
    private lastScrollTop = 0;

    activeSection: 'feed' | 'exchange' = 'feed';
    userId = '';
    userName = '';
    message = '';
    isLoading = false;

    @ViewChild(AccountModalComponent) accountModal?: AccountModalComponent;
    showLoginPrompt = false;

    // Create Post
    showCreatePost = false;
    newPost = { content: '', type: 'thought' as 'thought' | 'review', bookTitle: '', rating: 0 };

    // Social Feed
    feedPosts: ReaderPost[] = [];
    isFeedLoading = false;

    // Book Exchange
    availableSwaps: BookSwap[] = [];
    isSwapsLoading = false;

    // Search State
    searchQuery = '';
    isSearching = false;
    searchResults: { posts: ReaderPost[], users: any[] } = { posts: [], users: [] };
    showSearchResults = false;

    constructor(
        public communityService: CommunitySocialService,
        public authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private location: Location,
        private cdr: ChangeDetectorRef
    ) { }

    @HostListener('window:scroll', [])
    onWindowScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > this.lastScrollTop && scrollTop > 150) {
            // Scrolling down
            this.isHeaderVisible = false;
        } else {
            // Scrolling up
            this.isHeaderVisible = true;
        }
        
        this.cdr.detectChanges();
        this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    }

    ngOnInit(): void {
        this.authService.user$.subscribe((user: any) => {
            if (user) {
                this.userId = (user.id || user._id)?.toString();
                this.userName = user.full_name || user.username || '';
            } else {
                this.userId = '';
                this.userName = '';
            }
            this.loadActiveSection();
        });
    }

    switchSection(section: 'feed' | 'exchange') {
        this.activeSection = section;
        this.loadActiveSection();
    }

    loadActiveSection() {
        if (this.activeSection === 'feed') {
            this.loadFeed();
        } else if (this.activeSection === 'exchange') {
            this.loadSwaps();
        }
    }

    loadFeed() {
        this.isFeedLoading = true;
        this.communityService.getFeed().subscribe({
            next: (posts) => {
                this.feedPosts = posts;
                this.isFeedLoading = false;
            },
            error: (err) => {
                console.error('Error loading feed, using sample data', err);
                // Mock data that matches the HTML template structure
                this.feedPosts = [
                    { 
                        _id: '1', 
                        userId: 'user1', 
                        userName: 'أحمد محمد', 
                        content: 'أنهيت للتو كتاب "الأمير الصغير" وكان رائعاً! أنصح الجميع بقراءته 📚', 
                        type: 'review', 
                        bookTitle: 'الأمير الصغير', 
                        rating: 5, 
                        likes: [], 
                        commentsCount: 2,
                        createdAt: new Date().toISOString() 
                    },
                    { 
                        _id: '2', 
                        userId: 'user2', 
                        userName: 'سارة علي', 
                        content: 'القراءة هي الطريقة الأفضل للهروب من الواقع والغوص في عوالم جديدة ✨', 
                        type: 'thought', 
                        likes: ['user1'], 
                        commentsCount: 0,
                        createdAt: new Date().toISOString() 
                    }
                ] as any;
                this.isFeedLoading = false;
            }
        });
    }

    loadSwaps() {
        this.isSwapsLoading = true;
        this.communityService.getAvailableSwaps().subscribe({
            next: (swaps) => {
                this.availableSwaps = swaps;
                this.isSwapsLoading = false;
            },
            error: (err) => {
                console.error('Error loading swaps, using sample data', err);
                this.availableSwaps = [
                    { _id: '1', ownerId: 'user1', ownerName: 'أحمد محمد', bookTitle: 'كتاب الأمير الصغير', bookAuthor: 'أنطوان دو سانت', condition: 'ممتاز', lookingFor: 'أي كتاب في تطوير الذات', status: 'available', createdAt: new Date().toISOString() },
                    { _id: '2', ownerId: 'user2', ownerName: 'فاطمة أحمد', bookTitle: 'ألف ليلة وليلة', bookAuthor: 'مجهول', condition: 'جيد', lookingFor: 'روايات عربية', status: 'available', createdAt: new Date().toISOString() }
                ] as any;
                this.isSwapsLoading = false;
            }
        });
    }

    onSearch() {
        if (!this.searchQuery.trim()) {
            this.showSearchResults = false;
            return;
        }

        this.isSearching = true;
        this.communityService.search(this.searchQuery).subscribe({
            next: (results) => {
                this.searchResults = results;
                this.showSearchResults = true;
                this.isSearching = false;
            },
            error: (err) => {
                console.error('Search error', err);
                this.isSearching = false;
            }
        });
    }

    clearSearch() {
        this.searchQuery = '';
        this.showSearchResults = false;
        this.searchResults = { posts: [], users: [] };
    }

    viewProfile(userId: string) {
        this.router.navigate(['/profile', userId]);
    }

    goBack() {
        if (window.history.length > 1) {
            this.location.back();
        } else {
            this.router.navigate(['/']);
        }
    }

    toggleMenu(postId: string) {
        this.activeMenuId = this.activeMenuId === postId ? null : postId;
    }

    deletePost(postId: string) {
        if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
        const userId = this.authService.userValue?.id;
        if (!userId) return;

        this.communityService.deletePost(postId, userId).subscribe({
            next: () => {
                this.feedPosts = this.feedPosts.filter(p => (p.id || p._id) !== postId);
                this.activeMenuId = null;
                this.message = '✅ تم حذف المنشور بنجاح.';
                setTimeout(() => this.message = '', 3000);
            },
            error: (err) => console.error('Error deleting post', err)
        });
    }

    pinPost(post: ReaderPost, type: 'personal' | 'community') {
        const userId = this.authService.userValue?.id;
        if (!userId) return;
        const postId = post.id || post._id;
        if (!postId) return;

        this.communityService.pinPost(postId, userId, type).subscribe({
            next: (updatedPost) => {
                const index = this.feedPosts.findIndex(p => (p.id || p._id) === postId);
                if (index !== -1) {
                    this.feedPosts[index] = { ...this.feedPosts[index], ...updatedPost };
                    this.feedPosts.sort((a, b) => {
                        if (a.isPinned && !b.isPinned) return -1;
                        if (!a.isPinned && b.isPinned) return 1;
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    });
                }
                this.activeMenuId = null;
            }
        });
    }

    unpinPost(post: ReaderPost) {
        const userId = this.authService.userValue?.id;
        if (!userId) return;
        const postId = post.id || post._id;
        if (!postId) return;

        this.communityService.unpinPost(postId, userId).subscribe({
            next: (updatedPost) => {
                const index = this.feedPosts.findIndex(p => (p.id || p._id) === postId);
                if (index !== -1) {
                    this.feedPosts[index] = { ...this.feedPosts[index], ...updatedPost };
                }
                this.activeMenuId = null;
            }
        });
    }

    isAdminUser(): boolean {
        return this.authService.userValue?.role === 'admin';
    }

    isOwner(post: ReaderPost): boolean {
        return post.userId === this.authService.userValue?.id;
    }

    likePost(postId: string | undefined) {
        if (!postId) return;
        if (!this.userId) {
            this.openAccountModal();
            return;
        }
        this.communityService.likePost(postId, this.userId).subscribe({
            next: (updatedPost) => {
                // Update the post in the feed
                const index = this.feedPosts.findIndex(p => (p.id || p._id) === postId);
                if (index !== -1) {
                    this.feedPosts[index].likes = updatedPost.likes;
                }
            },
            error: (err) => console.error('Error liking post', err)
        });
    }

    toggleComments(post: ReaderPost) {
        post.showComments = !post.showComments;
    }

    toggleReplyInput(comment: any) {
        comment.showReplyInput = !comment.showReplyInput;
        if (comment.showReplyInput) {
            comment.replyText = '';
        }
    }

    getProfileImageUrl(url: string | null | undefined): string | null {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('data:')) return url;
        
        // Remove '/api' from apiBaseUrl to get the root domain
        const rootUrl = environment.apiBaseUrl.replace('/api', '');
        // Ensure url starts with /
        const cleanPath = url.startsWith('/') ? url : `/${url}`;
        return `${rootUrl}${cleanPath}`;
    }

    addComment(post: ReaderPost) {
        if (!post.newCommentText?.trim()) return;
        if (!this.userId) {
            this.openAccountModal();
            return;
        }

        const commentText = post.newCommentText;
        post.newCommentText = ''; // Clear input

        this.communityService.addComment(post.id || post._id!, {
            userId: this.userId,
            userName: this.authService.userValue?.username || 'قارئ',
            content: commentText
        }).subscribe({
            next: (updatedPost) => {
                post.comments = updatedPost.comments;
            },
            error: (err) => {
                console.error('Error adding comment', err);
                alert('فشل إضافة التعليق');
            }
        });
    }

    submitReply(post: ReaderPost, comment: any) {
        if (!comment.replyText?.trim()) return;
        if (!this.userId) {
            this.openAccountModal();
            return;
        }

        const replyText = comment.replyText;
        comment.replyText = '';
        comment.showReplyInput = false;

        this.communityService.addReply(post.id || post._id!, comment._id || comment.id!, {
            userId: this.userId,
            userName: this.authService.userValue?.username || 'قارئ',
            content: replyText
        }).subscribe({
            next: (updatedPost) => {
                // Update the single post in the feed to refresh comments/replies
                const postIndex = this.feedPosts.findIndex(p => (p.id || p._id) === (post.id || post._id));
                if (postIndex !== -1) {
                    this.feedPosts[postIndex].comments = updatedPost.comments;
                }
            },
            error: (err) => {
                console.error('Error adding reply', err);
                alert('فشل إضافة الرد');
            }
        });
    }

    sendSwapRequest(swapId: string) {
        this.isLoading = true;
        this.communityService.requestSwap(swapId, this.userId).subscribe({
            next: () => {
                this.message = '✅ تم إرسال طلب التبديل بنجاح!';
                this.isLoading = false;
                setTimeout(() => this.message = '', 3000);
            },
            error: (err) => {
                this.message = `❌ ${err.error.message || 'فشل إرسال الطلب'}`;
                this.isLoading = false;
            }
        });
    }

    handleCreatePostClick() {
        if (!this.userId) {
            this.openAccountModal();
        } else {
            this.showCreatePost = true;
        }
    }

    openAccountModal() {
        this.accountModal?.openModal();
    }

    createPost() {
        if (!this.newPost.content.trim()) return;
        if (!this.userId) {
            this.openAccountModal();
            return;
        }
        
        this.isLoading = true;
        this.communityService.createPost({
            userId: this.userId,
            content: this.newPost.content,
            type: this.newPost.type as any,
            bookTitle: this.newPost.type === 'review' ? this.newPost.bookTitle : undefined,
            rating: this.newPost.type === 'review' ? this.newPost.rating : undefined
        } as any).subscribe({
            next: (post) => {
                this.message = '✅ تم نشر المنشور بنجاح!';
                this.showCreatePost = false;
                this.newPost = { content: '', type: 'thought', bookTitle: '', rating: 0 };
                this.isLoading = false;
                this.loadFeed();
                setTimeout(() => this.message = '', 3000);
            },
            error: (err: any) => {
                console.error('Create Post Error:', err);
                this.message = `❌ ${err.error?.message || 'فشل نشر المنشور. يرجى المحاولة مرة أخرى.'}`;
                this.isLoading = false;
                setTimeout(() => this.message = '', 5000);
            }
        });
    }
}
