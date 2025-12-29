import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay, of, switchMap } from 'rxjs';
import { MushafPage, MushafMetadata, SurahMetadata, JuzMetadata, HizbMetadata } from '../models/mushaf.model';

@Injectable({
  providedIn: 'root'
})
export class MushafDataService {
  private loadedJuzChunks = new Map<number, Observable<MushafPage[]>>();
  private mushafData$?: Observable<MushafPage[]>;
  private metadata$?: Observable<MushafMetadata>;

  constructor(private http: HttpClient) { }

  /**
   * Returns the individual page data.
   * Now fetches only the required JUZ chunk for the requested page.
   */
  getPage(pageNumber: number): Observable<MushafPage | undefined> {
    return this.getMetadata().pipe(
      map(meta => {
        let targetJuzId = 1;
        for (const juz of meta.juzs) {
          if (juz.start_page <= pageNumber) {
            targetJuzId = juz.id;
          } else {
            break;
          }
        }
        return targetJuzId;
      }),
      switchMap(juzId => this.getJuzChunk(juzId)),
      map(pages => pages.find(p => p.page_number === pageNumber))
    );
  }

  private getJuzChunk(juzId: number): Observable<MushafPage[]> {
    if (!this.loadedJuzChunks.has(juzId)) {
      const obs = this.http.get<MushafPage[]>(`/assets/data/mushaf_chunks/juz_${juzId}.json`).pipe(
        shareReplay(1)
      );
      this.loadedJuzChunks.set(juzId, obs);
    }
    return this.loadedJuzChunks.get(juzId)!;
  }

  /**
   * Compatibility method for features requiring full Mushaf data (e.g. searching across session).
   * Note: This will still load data on demand.
   */
  getMushaf(): Observable<MushafPage[]> {
    // If we absolutely need the whole thing, we'd have to combine all chunks.
    // However, for current memorization logic, we usually only need the pages in the session.
    // For now, redirect to the old file if full access is truly needed, or better, refactor callers.
    if (!this.mushafData$) {
      this.mushafData$ = this.http.get<MushafPage[]>('/assets/data/mushaf.json').pipe(
        shareReplay(1)
      );
    }
    return this.mushafData$;
  }

  getFontName(pageNumber: number): string {
    if (pageNumber === 0) return 'QCF_BSML';
    const num = pageNumber.toString().padStart(3, '0');
    return `QCF_P${num}`;
  }

  getMetadata(): Observable<MushafMetadata> {
    if (!this.metadata$) {
      // Cache busting to ensure we get new total verses count
      this.metadata$ = this.http.get<MushafMetadata>(`/assets/data/mushaf-metadata.json?v=${new Date().getTime()}`).pipe(
        shareReplay(1)
      );
    }
    return this.metadata$;
  }

  getSurahAtPage(pageNumber: number): Observable<SurahMetadata | undefined> {
    return this.getMetadata().pipe(
      map(meta => meta.surahs.find(s => pageNumber >= s.start_page && pageNumber <= s.end_page))
    );
  }

  getJuzAtPage(pageNumber: number): Observable<JuzMetadata | undefined> {
    return this.getMetadata().pipe(
      map(meta => {
        // Find the highest Juz id where start_page <= pageNumber
        let currentJuz: JuzMetadata | undefined;
        for (const juz of meta.juzs) {
          if (juz.start_page <= pageNumber) {
            currentJuz = juz;
          } else {
            break;
          }
        }
        return currentJuz;
      })
    );
  }

  getHizbAtPage(pageNumber: number): Observable<HizbMetadata | undefined> {
    return this.getMetadata().pipe(
      map(meta => {
        let currentHizb: HizbMetadata | undefined;
        for (const hizb of meta.hizbs) {
          if (hizb.start_page <= pageNumber) {
            currentHizb = hizb;
          } else {
            break;
          }
        }
        return currentHizb;
      })
    );
  }
  getPageText(pageNumber: number): Observable<any> {
    // Fetching text_imlaei_simple for easier matching
    return this.http.get(`https://api.quran.com/api/v4/verses/by_page/${pageNumber}?words=true&word_fields=text_imlaei_simple`);
  }
}
