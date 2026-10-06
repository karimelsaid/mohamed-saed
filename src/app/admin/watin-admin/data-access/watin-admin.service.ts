import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AdminStatsResponse {
  success: boolean;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class WatinAdminService {
  private apiUrl = `${environment.apiBaseUrl}/admin/watin`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>(`${this.apiUrl}/stats`);
  }

  // Generic list method for speakers, categories, lectures, apps
  getList(entity: string, queryParams: any = {}): Observable<any> {
    let params = new HttpParams();
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] !== null && queryParams[key] !== undefined && queryParams[key] !== '') {
        params = params.set(key, queryParams[key]);
      }
    });
    return this.http.get<any>(`${this.apiUrl}/${entity}`, { params });
  }

  // Get single entity
  getById(entity: string, id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${entity}/${id}`);
  }

  // Create
  createEntity(entity: string, payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${entity}`, payload);
  }

  // Update
  updateEntity(entity: string, id: string, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${entity}/${id}`, payload);
  }

  // Patch
  patchEntity(entity: string, id: string, payload: any): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${entity}/${id}`, payload);
  }

  // Delete/Archive
  deleteEntity(entity: string, id: string, reassignTo?: string): Observable<any> {
    let params = new HttpParams();
    if (reassignTo) params = params.set('reassignTo', reassignTo);
    return this.http.delete<any>(`${this.apiUrl}/${entity}/${id}`, { params });
  }

  // Reorder (for categories and apps)
  reorder(entity: string, items: { id: string, sortOrder: number }[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${entity}/reorder`, items);
  }

  // Transcription Operations
  requestTranscription(lectureId: string): Observable<any> {
    // In a real app, this would hit a specific /transcribe endpoint that queues the job
    // For now, we simulate by patching the lecture's transcription status to 'pending'
    return this.http.patch<any>(`${this.apiUrl}/lectures/${lectureId}`, {
      'transcription.status': 'pending'
    });
  }
}
