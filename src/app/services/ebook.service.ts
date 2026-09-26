import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Ebook, AccessCheckResponse } from '../models/ebook.model';

import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class EbookService {
    private apiUrl = `${environment.apiBaseUrl}/ebooks`;

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

    // Stream with progress events
    streamEbookWithProgress(id: string): Observable<HttpEvent<Blob>> {
        return this.http.get(`${this.apiUrl}/${id}/stream`, {
            responseType: 'blob',
            reportProgress: true,
            observe: 'events'
        });
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

    // Admin: Reindex page counts for old ebooks with missing/zero pages
    reindexPageCounts(): Observable<{ success: boolean; message: string; total: number; updated: number; failed: number; results: any[] }> {
        return this.http.post<{ success: boolean; message: string; total: number; updated: number; failed: number; results: any[] }>(`${this.apiUrl}/reindex-pages`, {});
    }

    uploadEbookForProduct(productId: string, file: File, coverImage?: File): Observable<{ success: boolean; message: string; linkedEbookId: string }> {
        const formData = new FormData();
        formData.append('epub', file);
        if (coverImage) {
            formData.append('coverImage', coverImage);
        }
        return this.http.post<{ success: boolean; message: string; linkedEbookId: string }>(`${environment.apiBaseUrl}/admin/products/${productId}/epub`, formData);
    }

    // Legacy English-to-Arabic category map (for old ebooks stored with English enum values)
    private legacyCategoryMap: { [key: string]: string } = {
        'Business-Marketing-Finance': 'أعمال وتسويق ومالية',
        'Business-marketing-finance': 'أعمال وتسويق ومالية',
        'Education-children': 'تربية وأطفال',
        'Arts-crafts': 'فنون وحرف',
        'HealthMedicineScience': 'صحة وطب وعلوم',
        'Healthmedicinescience': 'صحة وطب وعلوم',
        'Islamic': 'كتب دينية',
        'Novels-stories': 'روايات وقصص',
        'Self-development-psychology': 'تطوير الذات وعلم النفس',
        'History-Biographies': 'تاريخ وسير ذاتية',
        'History-biographies': 'تاريخ وسير ذاتية',
        'Dictionaries-References': 'قواميس ومراجع',
        'Dictionaries-references': 'قواميس ومراجع',
        'office-supplies': 'أدوات مكتبية'
    };

    // Cached admin categories
    private adminCategoriesCache: { value: string; label: string }[] | null = null;

    // Get hardcoded fallback categories (legacy support)
    getCategories(): string[] {
        return [
            'روايات وقصص',
            'تطوير الذات وعلم النفس',
            'كتب دينية',
            'أعمال وتسويق ومالية',
            'صحة وطب وعلوم',
            'تاريخ وسير ذاتية',
            'تربية وأطفال',
            'فنون وحرف',
            'قواميس ومراجع'
        ];
    }

    // Fetch categories dynamically from the admin API
    fetchAdminCategories(): Observable<{ value: string; label: string }[]> {
        if (this.adminCategoriesCache) {
            return of(this.adminCategoriesCache);
        }
        const categoriesUrl = `${environment.apiBaseUrl.replace('/api', '')}/api/categories`;
        return this.http.get<any>(categoriesUrl).pipe(
            map((res: any) => {
                const cats = (res.data || res || []).filter((c: any) => c.isActive !== false);
                return cats.map((c: any) => ({ value: c.name, label: c.name }));
            }),
            tap((cats: { value: string; label: string }[]) => {
                this.adminCategoriesCache = cats;
            })
        );
    }

    // Get category display name in Arabic (handles legacy English values + Arabic categories)
    getCategoryDisplayName(category: string): string {
        if (!category) return 'غير مصنف';
        // If it's a legacy English enum value, translate it
        if (this.legacyCategoryMap[category]) {
            return this.legacyCategoryMap[category];
        }
        // Otherwise it's already an Arabic category name — return as-is
        return category;
    }
}
