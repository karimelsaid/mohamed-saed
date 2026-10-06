import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface DailyVerse {
  _id: string;
  surahName: string;
  ayahFrom: number;
  ayahTo: number;
  text: string;
  reflection?: string;
}

export interface WatinCategory {
  _id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  bgColor: string;
  iconColor: string;
  lectureCount: number;
}

export interface WatinSpeaker {
  _id: string;
  slug: string;
  name: string;
  title?: string;
  lectureCount: number;
}

export interface WatinLecture {
  _id: string;
  slug: string;
  title: string;
  description?: string;
  speaker?: { _id: string; name: string; title: string };
  category?: { _id: string; slug: string; name: string };
  durationSec: number;
  duration: string;
  hasTranscript: boolean;
  transcriptionStatus: string;
  publishedAt: string;
  tags: string[];
}

export interface HomeData {
  dailyVerse: DailyVerse | null;
  categories: WatinCategory[];
  latestLectures: WatinLecture[];
}

@Injectable({
  providedIn: 'root'
})
export class WatinService {
  private apiUrl = environment.apiBaseUrl + '/watin';

  constructor(private http: HttpClient) {}

  getHomeData(): Observable<{ success: boolean; data: HomeData }> {
    return this.http.get<{ success: boolean; data: HomeData }>(`${this.apiUrl}/home`);
  }

  getCategories(): Observable<{ success: boolean; data: WatinCategory[] }> {
    return this.http.get<{ success: boolean; data: WatinCategory[] }>(`${this.apiUrl}/categories`);
  }

  getLectures(filters?: { category?: string; speaker?: string; q?: string; status?: string; page?: number; limit?: number }): Observable<{ success: boolean; data: WatinLecture[]; meta: any }> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        if ((filters as any)[key]) {
          params = params.set(key, (filters as any)[key]);
        }
      });
    }
    return this.http.get<{ success: boolean; data: WatinLecture[]; meta: any }>(`${this.apiUrl}/lectures`, { params });
  }

  getLectureBySlug(slug: string): Observable<{ success: boolean; data?: WatinLecture & { transcript: any }; message?: string }> {
    return this.http.get<{ success: boolean; data?: WatinLecture & { transcript: any }; message?: string }>(`${this.apiUrl}/lectures/${slug}`);
  }

  getSpeakers(): Observable<{ success: boolean; data: WatinSpeaker[] }> {
    return this.http.get<{ success: boolean; data: WatinSpeaker[] }>(`${this.apiUrl}/speakers`);
  }

  browseIslamHouse(page: number = 1, limit: number = 25): Observable<{ success: boolean; data: any[]; meta: any }> {
    return this.http.get<{ success: boolean; data: any[]; meta: any }>(`${this.apiUrl}/islamhouse/browse`, {
      params: { page: page.toString(), limit: limit.toString() }
    });
  }

  searchIslamHouse(q: string, page: number = 1): Observable<{ success: boolean; data: any[]; meta: any }> {
    return this.http.get<{ success: boolean; data: any[]; meta: any }>(`${this.apiUrl}/islamhouse/search`, {
      params: { q, page: page.toString() }
    });
  }
}
