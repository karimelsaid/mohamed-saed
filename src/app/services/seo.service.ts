import { Injectable, Inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

export interface SeoConfig {
    title: string;
    description: string;
    keywords?: string;
    image?: string;
    url?: string;
    type?: string; // 'website' | 'product' | 'article'
    price?: number;
    currency?: string;
    availability?: string;
}

@Injectable({
    providedIn: 'root'
})
export class SeoService {
    private readonly defaultTitle = 'knoozbook - مكتبة كنوز';
    private readonly defaultDescription = 'مكتبة كنوز هي مكتبة عربية إلكترونية تقدم مجموعة متنوعة من الكتب في التنمية الذاتية، الروايات، الكتب الدينية، كتب الأطفال، التاريخ، الفنون، والمزيد. اكتشف أفضل الكتب بأسعار مميزة وخدمة توصيل لجميع المحافظات.';
    private readonly defaultKeywords = 'مكتبة كنوز, كتب عربية, كتب تنمية بشرية, روايات عربية, كتب دينية, كتب أطفال, شراء كتب أونلاين, مكتبة إلكترونية';
    private readonly siteUrl = 'https://knoozbook.com';
    private jsonLdElement: HTMLScriptElement | null = null;

    constructor(
        private meta: Meta,
        private titleService: Title,
        @Inject(DOCUMENT) private document: Document
    ) { }

    /**
     * Update all SEO tags at once for a given page.
     */
    updateMetaTags(config: SeoConfig): void {
        const title = config.title ? `${config.title} | مكتبة كنوز` : this.defaultTitle;
        const description = config.description || this.defaultDescription;
        const keywords = config.keywords || this.defaultKeywords;
        const image = config.image || `${this.siteUrl}/logoname2.jpg`;
        const url = config.url || this.siteUrl;
        const type = config.type || 'website';

        // --- Standard Meta Tags ---
        this.titleService.setTitle(title);
        this.meta.updateTag({ name: 'description', content: description });
        this.meta.updateTag({ name: 'keywords', content: keywords });

        // --- Open Graph Tags (Facebook, WhatsApp, Telegram, etc.) ---
        this.meta.updateTag({ property: 'og:title', content: title });
        this.meta.updateTag({ property: 'og:description', content: description });
        this.meta.updateTag({ property: 'og:image', content: image });
        this.meta.updateTag({ property: 'og:url', content: url });
        this.meta.updateTag({ property: 'og:type', content: type });
        this.meta.updateTag({ property: 'og:site_name', content: 'مكتبة كنوز - knoozbook' });
        this.meta.updateTag({ property: 'og:locale', content: 'ar_EG' });

        // --- Twitter Card Tags ---
        this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this.meta.updateTag({ name: 'twitter:title', content: title });
        this.meta.updateTag({ name: 'twitter:description', content: description });
        this.meta.updateTag({ name: 'twitter:image', content: image });

        // --- Product-specific OG tags ---
        if (type === 'product' && config.price !== undefined) {
            this.meta.updateTag({ property: 'product:price:amount', content: config.price.toString() });
            this.meta.updateTag({ property: 'product:price:currency', content: config.currency || 'EGP' });
            if (config.availability) {
                this.meta.updateTag({ property: 'product:availability', content: config.availability });
            }
        }

        // --- Canonical URL ---
        this.updateCanonicalUrl(url);
    }

    /**
     * Set JSON-LD structured data for a product page.
     */
    setProductJsonLd(product: {
        name: string;
        description: string;
        image: string;
        price: number;
        priceBefore?: number;
        currency?: string;
        availability?: string;
        category?: string;
        brand?: string;
        url: string;
        rating?: number;
        ratingCount?: number;
    }): void {
        const jsonLd: any = {
            '@context': 'https://schema.org',
            '@type': 'Product',
            'name': product.name,
            'description': product.description || `${product.name} - متوفر الآن في مكتبة كنوز`,
            'image': product.image,
            'url': product.url,
            'brand': {
                '@type': 'Brand',
                'name': product.brand || 'مكتبة كنوز'
            },
            'category': product.category || 'كتب',
            'offers': {
                '@type': 'Offer',
                'price': product.price,
                'priceCurrency': product.currency || 'EGP',
                'availability': product.availability === 'in_stock'
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                'seller': {
                    '@type': 'Organization',
                    'name': 'مكتبة كنوز'
                },
                'url': product.url
            }
        };

        // Add aggregate rating if available
        if (product.rating && product.ratingCount && product.ratingCount > 0) {
            jsonLd['aggregateRating'] = {
                '@type': 'AggregateRating',
                'ratingValue': product.rating.toFixed(1),
                'reviewCount': product.ratingCount,
                'bestRating': '5',
                'worstRating': '1'
            };
        }

        this.setJsonLd(jsonLd);
    }

    /**
     * Set JSON-LD for any schema type.
     */
    setJsonLd(data: any): void {
        this.removeJsonLd();
        this.jsonLdElement = this.document.createElement('script');
        this.jsonLdElement.type = 'application/ld+json';
        this.jsonLdElement.text = JSON.stringify(data);
        this.document.head.appendChild(this.jsonLdElement);
    }

    /**
     * Remove existing JSON-LD elements.
     */
    removeJsonLd(): void {
        if (this.jsonLdElement && this.jsonLdElement.parentNode) {
            this.jsonLdElement.parentNode.removeChild(this.jsonLdElement);
            this.jsonLdElement = null;
        }
    }

    /**
     * Reset to default meta tags (for non-product pages).
     */
    resetToDefaults(): void {
        this.updateMetaTags({
            title: '',
            description: this.defaultDescription,
            keywords: this.defaultKeywords,
            url: this.siteUrl
        });
        this.removeJsonLd();
    }

    /**
     * Update or create canonical URL link element.
     */
    private updateCanonicalUrl(url: string): void {
        let link = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!link) {
            link = this.document.createElement('link');
            link.setAttribute('rel', 'canonical');
            this.document.head.appendChild(link);
        }
        link.setAttribute('href', url);
    }
}
