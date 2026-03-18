import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReaderPost, Comment } from '../models/post.model';
import { BookSwap } from '../models/book-swap.model';

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

  offerBookForSwap(swap: Partial<BookSwap>): Observable<BookSwap> {
    return this.http.post<BookSwap>(`${this.apiUrl}/community/book-swaps`, swap);
  }

  requestSwap(swapId: string, requesterId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/community/book-swaps/${swapId}/request`, { requesterId });
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
}
