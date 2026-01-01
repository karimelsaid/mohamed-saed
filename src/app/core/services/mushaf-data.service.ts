import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay, of, switchMap, from } from 'rxjs';
import { MushafPage, MushafMetadata, SurahMetadata, JuzMetadata, HizbMetadata } from '../models/mushaf.model';
import { MushafAssetService } from './mushaf-asset.service';

@Injectable({
  providedIn: 'root'
})
export class MushafDataService {
  private loadedJuzChunks = new Map<number, Observable<MushafPage[]>>();
  private mushafData$?: Observable<MushafPage[]>;
  private metadata$?: Observable<MushafMetadata>;

  constructor(
    private http: HttpClient,
    private assetService: MushafAssetService
  ) { }

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
   */
  getPageNumberForVerse(surah: number, verse: number): Observable<number> {
    const verseKey = `${surah}:${verse}`;
    return this.http.get<any>(`https://api.quran.com/api/v4/verses/by_key/${verseKey}`).pipe(
      map(response => response.verse.page_number)
    );
  }
}

