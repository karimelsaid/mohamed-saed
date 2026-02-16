import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { map, shareReplay, switchMap, catchError } from 'rxjs/operators';
import { MushafPage, MushafMetadata, SurahMetadata, JuzMetadata, HizbMetadata } from '../models/mushaf.model';
import { MushafAssetService } from './mushaf-asset.service';

@Injectable({
  providedIn: 'root'
})
export class MushafDataService {
  private loadedJuzChunks = new Map<number, Observable<MushafPage[]>>();
  private mushafData$?: Observable<MushafPage[]>;
  private metadata$?: Observable<MushafMetadata>;
  private searchData$?: Observable<any[]>;

  constructor(
    private http: HttpClient,
    private assetService: MushafAssetService
  ) { }

  /**
   * Clears all cached data to force a fresh load from storage/network.
   */
  clearCache() {
    this.loadedJuzChunks.clear();
    this.mushafData$ = undefined;
    this.metadata$ = undefined;
    this.searchData$ = undefined;
  }

  /**
   * Returns the individual page data.
   * Now fetches only the required JUZ chunk for the requested page.
   */
  getPage(pageNumber: number): Observable<MushafPage | undefined> {
    console.log(`[MushafData] Requested Page: ${pageNumber}`);
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
        console.log(`[MushafData] Page ${pageNumber} belongs to Juz ${targetJuzId}`);
        return targetJuzId;
      }),
      switchMap(juzId => {
        console.log(`[MushafData] Loading Juz chunk: ${juzId}`);
        return this.getJuzChunk(juzId);
      }),
      map(pages => {
        const page = pages.find(p => p.page_number === pageNumber);
        if (!page) {
          console.error(`[MushafData] CRITICAL: Page ${pageNumber} not found in Juz chunk!`);
        } else {
          console.log(`[MushafData] Page ${pageNumber} data found successfully.`);
        }
        return page;
      })
    );
  }

  private getJuzChunk(juzId: number): Observable<MushafPage[]> {
    if (!this.loadedJuzChunks.has(juzId)) {
      const obs = from(this.assetService.getJsonData<MushafPage[]>(`data/mushaf_chunks/juz_${juzId}.json`)).pipe(
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
    if (!this.mushafData$) {
      this.mushafData$ = from(this.assetService.getJsonData<MushafPage[]>('data/mushaf.json')).pipe(
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
      this.metadata$ = from(this.assetService.getJsonData<MushafMetadata>('data/mushaf-metadata.json')).pipe(
        catchError(err => {
          this.metadata$ = undefined; // Allow retry
          throw err;
        }),
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
    // API calls remain external
    return this.http.get(`https://api.quran.com/api/v4/verses/by_page/${pageNumber}?words=true&word_fields=text_imlaei_simple`);
  }

  /**
   * Get precise page number for a specific verse key (e.g., "2:142") or Surah/Verse numbers.
   * Now works offline by searching Juz chunks.
   */
  getPageNumberForVerse(surah: number, verse: number): Observable<number> {
    const verseKey = `${surah}:${verse}`;

    return this.getSurahMetadata(surah).pipe(
      switchMap(surahMeta => {
        if (!surahMeta) {
          return this.http.get<any>(`https://api.quran.com/api/v4/verses/by_key/${verseKey}`).pipe(
            map(response => response.verse.page_number)
          );
        }

        // Logic to find which Juz this surah belongs to at the start
        return this.getJuzAtPage(surahMeta.start_page).pipe(
          switchMap(juzMeta => {
            if (!juzMeta) return of(surahMeta.start_page);

            // Search through Juz chunks starting from this Juz to find the verse
            // Usually a surah is within 1-2 Juzs.
            return this.findVerseInJuzRange(juzMeta.id, surahMeta.start_page, surahMeta.end_page, verseKey);
          })
        );
      })
    );
  }

  private getSurahMetadata(surahId: number): Observable<SurahMetadata | undefined> {
    return this.getMetadata().pipe(
      map(meta => meta.surahs.find(s => s.id === surahId))
    );
  }

  private findVerseInJuzRange(startJuz: number, startPage: number, endPage: number, verseKey: string): Observable<number> {
    // Determine the end Juz for this surah's page range
    return this.getMetadata().pipe(
      switchMap(meta => {
        let endJuzId = startJuz;
        for (const juz of meta.juzs) {
          if (juz.start_page <= endPage) {
            endJuzId = juz.id;
          } else {
            break;
          }
        }

        // Search through Juz chunks in the range
        // For simplicity and to avoid complex recursive RxJS, we check up to 3 Juzs (max a surah usually spans)
        return this.searchInJuz(startJuz, verseKey, 0).pipe(
          switchMap(page => {
            if (page > 0) return of(page);
            if (endJuzId > startJuz) {
              return this.searchInJuz(startJuz + 1, verseKey, 0).pipe(
                switchMap(page2 => {
                  if (page2 > 0) return of(page2);
                  if (endJuzId > startJuz + 1) {
                    return this.searchInJuz(startJuz + 2, verseKey, startPage);
                  }
                  return of(startPage);
                })
              );
            }
            return of(startPage);
          })
        );
      })
    );
  }

  private searchInJuz(juzId: number, verseKey: string, fallbackPage: number): Observable<number> {
    return this.getJuzChunk(juzId).pipe(
      map(pages => {
        const page = pages.find(p => p.lines.some(l => l.segments?.some(s => s.verse_key === verseKey)));
        return page ? page.page_number : fallbackPage;
      })
    );
  }

  /**
   * Returns split data for half-page logic.
   */
  getPageSplits(): Observable<any[]> {
    // Fetch directly from local assets (User moved it to public/json/split.json)
    // This works on both Web and Android (via WebView) without needing the backend or asset downloader.
    return this.http.get<any[]>('json/split.json').pipe(
      catchError(err => {
        console.warn('[MushafData] Failed to load local split.json, trying asset service fallback', err);
        return from(this.assetService.getJsonData<any[]>('data/mushaf_chunks/split.json'));
      })
    );
  }

  getSearchData(): Observable<any[]> {
    if (!this.searchData$) {
      this.searchData$ = from(this.assetService.getJsonData<any[]>('data/quran-search.json')).pipe(
        catchError(err => {
          this.searchData$ = undefined;
          throw err;
        }),
        shareReplay(1)
      );
    }
    return this.searchData$;
  }
}

