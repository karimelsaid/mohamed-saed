import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface ASRReviewRequest {
  audio_file: File;
  expected_surah: number;
  expected_ayah_start: number;
  expected_ayah_end: number;
}

export interface ASRError {
  surah: number;
  ayah: number;
  word_index: number;
  error_type: 'missing' | 'extra' | 'incorrect';
  expected_word: string;
  transcribed_word?: string;
  confidence: number;
}

export interface ASRReviewResponse {
  transcribed_text: string;
  confidence_score: number;
  errors: ASRError[];
  accuracy_score: number;
  word_count: number;
  correct_words: number;
  missing_words: number;
  extra_words: number;
  incorrect_words: number;
  processing_time_ms: number;
}

@Injectable({
  providedIn: 'root'
})
export class AsrReviewService {
  private apiBaseUrl = environment.ssrApiBaseUrl || environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  reviewRecitation(request: ASRReviewRequest): Observable<ASRReviewResponse> {
    const formData = new FormData();
    formData.append('audio_file', request.audio_file);
    formData.append('expected_surah', request.expected_surah.toString());
    formData.append('expected_ayah_start', request.expected_ayah_start.toString());
    formData.append('expected_ayah_end', request.expected_ayah_end.toString());

    return this.http.post<ASRReviewResponse>(
      `${this.apiBaseUrl}/asr-review/review`,
      formData
    );
  }

  checkHealth(): Observable<any> {
    return this.http.get(`${this.apiBaseUrl}/asr-review/health`);
  }

  getVersion(): Observable<any> {
    return this.http.get(`${this.apiBaseUrl}/asr-review/version`);
  }
}
