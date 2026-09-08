import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface YouTubeVideo {
  _id: string;
  title: string;
  description: string;
  contentType: 'text_summary' | 'video_summary';
  sourceContent: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  status: 'draft' | 'processing' | 'scheduled' | 'uploading' | 'published' | 'failed';
  scheduledAt?: string;
  publishedAt?: string;
  tags: string[];
  category: string;
  privacy: 'public' | 'unlisted' | 'private';
  n8nExecutionId?: string;
  errorMessage?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface YouTubeStats {
  total: number;
  published: number;
  scheduled: number;
  processing: number;
  failed: number;
  draft: number;
}

@Injectable({
  providedIn: 'root'
})
export class YoutubeService {
  private apiUrl = `${environment.apiBaseUrl}/youtube`;

  constructor(private http: HttpClient) { }

  getStats(): Observable<{ success: boolean; stats: YouTubeStats }> {
    return this.http.get<{ success: boolean; stats: YouTubeStats }>(`${this.apiUrl}/stats`);
  }

  getVideos(page: number = 1, limit: number = 20, status?: string): Observable<any> {
    let params = `?page=${page}&limit=${limit}`;
    if (status && status !== 'all') params += `&status=${status}`;
    return this.http.get(`${this.apiUrl}/videos${params}`);
  }

  getVideo(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/videos/${id}`);
  }

  createVideo(data: Partial<YouTubeVideo>): Observable<any> {
    return this.http.post(`${this.apiUrl}/videos`, data);
  }

  updateVideo(id: string, data: Partial<YouTubeVideo>): Observable<any> {
    return this.http.patch(`${this.apiUrl}/videos/${id}`, data);
  }

  deleteVideo(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/videos/${id}`);
  }

  publishNow(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/videos/${id}/publish`, {});
  }

  scheduleVideo(id: string, scheduledAt: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/videos/${id}/schedule`, { scheduledAt });
  }

  retryVideo(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/videos/${id}/retry`, {});
  }

  triggerWorkflow(videoId?: string, action?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trigger-workflow`, { videoId, action });
  }
}
