import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Ebook, AccessCheckResponse } from '../models/ebook.model';

@Injectable({
    providedIn: 'root'
})
export class EbookService {
    private apiUrl = '/api/ebooks';

    constructor(private http: HttpClient) { }

    // Get all ebooks with optional filters and pagination
    getEbooks(filters?: { category?: string; language?: string; search?: string; includeInvalid?: boolean }, page = 1, limit = 20): Observable<{ success: boolean; count: number; total: number; page: number; pages: number; data: Ebook[] }> {
        let params = new HttpParams()
            .set('page', page.toString())
            .set('limit', limit.toString());

        if (filters) {
            if (filters.category) params = params.set('category', filters.category);
            if (filters.language) params = params.set('language', filters.language);
            if (filters.search) params = params.set('search', filters.search);
            if (filters.includeInvalid) params = params.set('includeInvalid', 'true');
        }

        return this.http.get<{ success: boolean; count: number; total: number; page: number; pages: number; data: Ebook[] }>(this.apiUrl, { params });
    }

    // Get single ebook by ID
    getEbookById(id: string): Observable<{ success: boolean; data: Ebook }> {
        return this.http.get<{ success: boolean; data: Ebook }>(`${this.apiUrl}/${id}`);
    }

    // Check if user has access to ebook
    checkAccess(ebookId: string): Observable<AccessCheckResponse> {
        return this.http.get<AccessCheckResponse>(`${this.apiUrl}/${ebookId}/check-access`);
    }

    // Get ebook file for reading (returns blob)
    streamEbook(id: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/${id}/stream`, { responseType: 'blob' });
    }

    // Stream public ebook preview (no auth required)
    streamPublicEbook(id: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/${id}/stream/public`, { responseType: 'blob' });
    }

    // Admin: Create new ebook
    createEbook(ebookData: FormData): Observable<{ success: boolean; message: string; data: Ebook }> {
        return this.http.post<{ success: boolean; message: string; data: Ebook }>(this.apiUrl, ebookData);
    }

    // Admin: Update ebook
    updateEbook(id: string, ebookData: FormData): Observable<{ success: boolean; message: string; data: Ebook }> {
        return this.http.put<{ success: boolean; message: string; data: Ebook }>(`${this.apiUrl}/${id}`, ebookData);
    }

    // Admin: Delete ebook
    deleteEbook(id: string): Observable<{ success: boolean; message: string }> {
        return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`);
    }

    // Get categories for filtering
    getCategories(): string[] {
        return [
            'Business-Marketing-Finance',
            'Education-children',
            'Arts-crafts',
            'HealthMedicineScience',
            'Islamic',
            'Novels-stories',
            'Self-development-psychology',
            'History-Biographies',
            'Dictionaries-References'
        ];
    }

    // Get category display name in Arabic
    getCategoryDisplayName(category: string): string {
        const categoryNames: { [key: string]: string } = {
            'Business-Marketing-Finance': 'الأعمال والتسويق والمالية',
            'Education-children': 'تعليم الأطفال',
            'Arts-crafts': 'الفنون والحرف',
            'HealthMedicineScience': 'الصحة والطب والعلوم',
            'Islamic': 'إسلامي',
            'Novels-stories': 'الروايات والقصص',
            'Self-development-psychology': 'تطوير الذات وعلم النفس',
            'History-Biographies': 'التاريخ والسير الذاتية',
            'Dictionaries-References': 'القواميس والمراجع'
        };
        return categoryNames[category] || category;
    }
}
