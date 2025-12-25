import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MushafFontService {
  private loadedFonts = new Set<string>();
  private loadedFontsSubject = new BehaviorSubject<Set<string>>(new Set());
  private renderer: Renderer2;

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  getLoadedFonts$(): Observable<Set<string>> {
    return this.loadedFontsSubject.asObservable();
  }

  isFontLoaded(fontName: string): boolean {
    return this.loadedFonts.has(fontName);
  }

  loadPageFont(pageNumber: number): Promise<void> {
    const fontName = `QCF_P${pageNumber.toString().padStart(3, '0')}`;
    if (this.loadedFonts.has(fontName)) {
      // If already loaded, still try to prefetch neighbors
      this.prefetchNextPages(pageNumber);
      return Promise.resolve();
    }

    const fontUrl = `/assets/fonts/mushaf/${fontName}.woff2`;
    return this.loadFont(fontName, fontUrl).then(() => {
      this.prefetchNextPages(pageNumber);
    });
  }

  /**
   * Loads the next and previous page fonts in the background for a seamless experience.
   */
  private prefetchNextPages(currentPage: number): void {
    const forwardRange = 10;
    const backwardRange = 5;
    const pagesToPrefetch: number[] = [];

    for (let i = 1; i <= forwardRange; i++) pagesToPrefetch.push(currentPage + i);
    for (let i = 1; i <= backwardRange; i++) pagesToPrefetch.push(currentPage - i);

    pagesToPrefetch.forEach(p => {
      if (p >= 1 && p <= 604) {
        const fontName = `QCF_P${p.toString().padStart(3, '0')}`;
        if (!this.loadedFonts.has(fontName)) {
          const fontUrl = `/assets/fonts/mushaf/${fontName}.woff2`;
          this.loadFont(fontName, fontUrl).catch(() => { /* Silent fail */ });
        }
      }
    });
  }

  loadBasmalahFont(): Promise<void> {
    const fontName = 'QCF_BSML';
    if (this.loadedFonts.has(fontName)) return Promise.resolve();

    const fontUrl = '/assets/fonts/mushaf/QCF_BSML.woff2';
    return this.loadFont(fontName, fontUrl);
  }

  private loadFont(fontName: string, fontUrl: string): Promise<void> {
    const font = new FontFace(fontName, `url(${fontUrl}) format('woff2')`, {
      display: 'block'
    });

    return font.load().then((loadedFont) => {
      (document as any).fonts.add(loadedFont);
      this.loadedFonts.add(fontName);
      this.loadedFontsSubject.next(new Set(this.loadedFonts));
      console.log(`Font loaded successfully: ${fontName}`);
    }).catch(err => {
      console.error(`Failed to load font: ${fontName} from ${fontUrl}`, err);
      throw err;
    });
  }
}
