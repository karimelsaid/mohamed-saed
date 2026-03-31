import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReaderPost, Comment } from '../models/post.model';
import { BookSwap } from '../models/book-swap.model';
import { Auction } from '../models/auction.model';

@Injectable({
  providedIn: 'root'
})
export class CommunitySocialService {
  private apiUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // Posts Feed
  getFeed(): Observable<ReaderPost[]> {
    return this.http.get<ReaderPost[]>(`${this.apiUrl}/community/feed`);
  }

  createPost(post: Partial<ReaderPost>): Observable<ReaderPost> {
    return this.http.post<ReaderPost>(`${this.apiUrl}/community/posts`, post);
  }

  likePost(postId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/posts/${postId}/like`, { userId });
  }

  deletePost(postId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/community/posts/${postId}`, { body: { userId } });
  }

  pinPost(postId: string, userId: string, type: 'personal' | 'community'): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/posts/${postId}/pin`, { userId, type });
  }

  unpinPost(postId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/posts/${postId}/unpin`, { userId });
  }

  addComment(postId: string, comment: Partial<Comment>): Observable<ReaderPost> {
    return this.http.post<ReaderPost>(`${this.apiUrl}/community/posts/${postId}/comments`, comment);
  }

  addReply(postId: string, commentId: string, reply: Partial<Comment>): Observable<ReaderPost> {
    return this.http.post<ReaderPost>(`${this.apiUrl}/community/posts/${postId}/comments/${commentId}/replies`, reply);
  }

  // User Specific Posts
  getUserPosts(userId: string): Observable<ReaderPost[]> {
    return this.http.get<ReaderPost[]>(`${this.apiUrl}/community/user-posts/${userId}`);
  }

  // Book Exchange
  getAvailableSwaps(): Observable<BookSwap[]> {
    return this.http.get<BookSwap[]>(`${this.apiUrl}/community/book-swaps`);
  }

  offerBookForSwap(swap: any): Observable<BookSwap> {
    return this.http.post<BookSwap>(`${this.apiUrl}/community/book-swaps`, swap);
  }

  deleteSwap(swapId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/community/book-swaps/${swapId}`, { body: { userId } });
  }

  requestSwap(swapId: string, requesterId: string, offeredBookTitle: string, offeredBookCondition: string, offeredBookNotes?: string, offeredBookImage?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/book-swaps/${swapId}/request`, { 
      requesterId, 
      offeredBookTitle, 
      offeredBookCondition,
      offeredBookNotes,
      offeredBookImage
    });
  }

  rejectSwapRequest(swapId: string, requestId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/book-swaps/${swapId}/reject/${requestId}`, {});
  }

  // Auctions
  getAuctions(): Observable<Auction[]> {
    return this.http.get<Auction[]>(`${this.apiUrl}/community/auctions`);
  }

  createAuction(auction: any): Observable<Auction> {
    return this.http.post<Auction>(`${this.apiUrl}/community/auctions`, auction);
  }

  placeBid(auctionId: string, userId: string, amount: number): Observable<Auction> {
    return this.http.post<Auction>(`${this.apiUrl}/community/auctions/${auctionId}/bid`, { userId, amount });
  }

  deleteAuction(auctionId: string, userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/community/auctions/${auctionId}`, { body: { userId } });
  }

  acceptSwapRequest(swapId: string, requestId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/book-swaps/${swapId}/accept/${requestId}`, {});
  }

  finalizeAuction(auctionId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/auctions/${auctionId}/finalize`, {});
  }

  getAdminStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/community/admin/stats`);
  }
  
  // User Stats
  getUserSocialStats(userId: string, viewerId?: string): Observable<{ likesReceived: number, followingCount: number, followersCount: number, isFollowing: boolean }> {
    return this.http.get<any>(`${this.apiUrl}/community/users/${userId}/social?viewerId=${viewerId || ''}`);
  }

  followUser(targetId: string, followerId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/users/${targetId}/follow`, { followerId });
  }

  unfollowUser(targetId: string, followerId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/users/${targetId}/unfollow`, { followerId });
  }

  search(query: string): Observable<{ posts: ReaderPost[], users: any[] }> {
    return this.http.get<{ posts: ReaderPost[], users: any[] }>(`${this.apiUrl}/community/search?q=${query}`);
  }

  updateCommunityStatus(id: string, type: 'swap' | 'auction', field: string, value: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/community/update-status`, { id, type, field, value });
  }
}
