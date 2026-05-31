const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

// Helper to create mini EPUB
async function createMiniEpub(inputPath, outputPath) {
    try {
        const zip = new AdmZip(inputPath);
        const zipEntries = zip.getEntries();

        // Find container.xml
        const containerEntry = zipEntries.find(entry => entry.entryName === 'META-INF/container.xml');
        if (!containerEntry) throw new Error('Invalid EPUB: META-INF/container.xml not found');

        const parser = new xml2js.Parser();
        const builder = new xml2js.Builder();

        const containerData = await parser.parseStringPromise(containerEntry.getData().toString('utf8'));
        const rootPath = containerData.container.rootfiles[0].rootfile[0].$['full-path'];

        // Find OPF file
        const opfEntry = zipEntries.find(entry => entry.entryName === rootPath);
        if (!opfEntry) throw new Error(`Invalid EPUB: OPF file ${rootPath} not found`);

        const opfData = await parser.parseStringPromise(opfEntry.getData().toString('utf8'));

        // Get spine
        const spine = opfData.package.spine[0].itemref;

        // Keep first 20% or at least 3 chapters
        const totalChapters = spine.length;
        const keepCount = Math.max(3, Math.ceil(totalChapters * 0.2));

        const keptSpineItems = spine.slice(0, keepCount);

        // Update spine
        opfData.package.spine[0].itemref = keptSpineItems;

        const newOpfContent = builder.buildObject(opfData);
        zip.updateFile(rootPath, Buffer.from(newOpfContent, 'utf8'));

        zip.writeZip(outputPath);
        return true;
    } catch (error) {
        console.error('Error creating mini EPUB:', error);
        return false;
    }
}

// Helper to extract metadata and page count
async function extractMetadata(filePath) {
    try {
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();

        // Find container.xml
        const containerEntry = zipEntries.find(entry => entry.entryName === 'META-INF/container.xml');
        if (!containerEntry) throw new Error('Invalid EPUB: META-INF/container.xml not found');

        const parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: false,
            tagNameProcessors: [xml2js.processors.stripPrefix] // Strip namespace prefixes (e.g. dc:title -> title)
        });
        
        // Also keep a parser with arrays for spine/manifest iteration
        const parserArray = new xml2js.Parser();

        const containerData = await parser.parseStringPromise(containerEntry.getData().toString('utf8'));
        
        // Handle both single rootfile and array
        const rootfiles = containerData.container.rootfiles.rootfile;
        const rootFile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
        const rootPath = rootFile.$['full-path'];
        const opfDir = rootPath.substring(0, rootPath.lastIndexOf('/'));

        // Find OPF file
        const opfEntry = zipEntries.find(entry => entry.entryName === rootPath);
        if (!opfEntry) throw new Error(`Invalid EPUB: OPF file ${rootPath} not found`);

        // Parse OPF with array parser for iteration
        const opfDataArray = await parserArray.parseStringPromise(opfEntry.getData().toString('utf8'));
        // Parse OPF with stripped prefixes for metadata
        const opfData = await parser.parseStringPromise(opfEntry.getData().toString('utf8'));

        const metadata = opfData.package.metadata;

        // Extract Basic Info
        const getMetaField = (field) => {
            const val = metadata[field] || metadata[`dc:${field}`];
            if (!val) return null;
            if (typeof val === 'string') return val;
            if (Array.isArray(val)) return typeof val[0] === 'object' ? val[0]._ || val[0] : val[0];
            if (typeof val === 'object') return val._ || val;
            return null;
        };

        const info = {
            title: getMetaField('title'),
            author: getMetaField('creator') || 'Unknown',
            publisher: getMetaField('publisher'),
            language: getMetaField('language'),
            description: getMetaField('description'),
            pages: 0
        };

        // =========================================================
        // STRATEGY 1: Extract page-list from EPUB3 Navigation Document
        // =========================================================
        let pageListCount = 0;

        const manifestItems = opfDataArray.package.manifest[0].item;
        const spine = opfDataArray.package.spine[0].itemref;

        // Find the EPUB3 navigation document (nav)
        const navItem = manifestItems.find(item =>
            (item.$.properties && item.$.properties.includes('nav')) ||
            (item.$['media-type'] && item.$['media-type'] === 'application/xhtml+xml' && item.$.href && item.$.href.toLowerCase().includes('nav'))
        );

        if (navItem) {
            const navHref = opfDir ? `${opfDir}/${navItem.$.href}` : navItem.$.href;
            const navEntry = zipEntries.find(e => e.entryName === navHref || e.entryName === decodeURIComponent(navHref));

            if (navEntry) {
                const navContent = navEntry.getData().toString('utf8');
                // Look for <nav epub:type="page-list"> ... </nav>
                const pageListMatch = navContent.match(/<nav[^>]*epub:type\s*=\s*["']page-list["'][^>]*>([\s\S]*?)<\/nav>/i);
                if (pageListMatch) {
                    // Count <a> tags inside the page-list nav
                    const anchorMatches = pageListMatch[1].match(/<a[^>]*>/gi);
                    if (anchorMatches) {
                        pageListCount = anchorMatches.length;
                        console.log(`📖 [EPUB] Found EPUB3 page-list with ${pageListCount} pages`);
                    }
                }
            }
        }

        // =========================================================
        // STRATEGY 2: Extract page-list from EPUB2 NCX file
        // =========================================================
        if (pageListCount === 0) {
            // Find the NCX file
            const ncxItem = manifestItems.find(item =>
                (item.$['media-type'] && item.$['media-type'] === 'application/x-dtbncx+xml') ||
                (item.$.href && item.$.href.toLowerCase().endsWith('.ncx'))
            );

            if (ncxItem) {
                const ncxHref = opfDir ? `${opfDir}/${ncxItem.$.href}` : ncxItem.$.href;
                const ncxEntry = zipEntries.find(e => e.entryName === ncxHref || e.entryName === decodeURIComponent(ncxHref));

                if (ncxEntry) {
                    const ncxContent = ncxEntry.getData().toString('utf8');
                    // Look for <pageList> element
                    const pageListMatch = ncxContent.match(/<pageList[^>]*>([\s\S]*?)<\/pageList>/i);
                    if (pageListMatch) {
                        // Count <pageTarget> elements
                        const pageTargets = pageListMatch[1].match(/<pageTarget[^>]*>/gi);
                        if (pageTargets) {
                            pageListCount = pageTargets.length;
                            console.log(`📖 [EPUB] Found NCX page-list with ${pageListCount} pages`);
                        }
                    }
                }
            }
        }

        // =========================================================
        // STRATEGY 3: Check OPF metadata for dc:source or meta with page count
        // =========================================================
        if (pageListCount === 0) {
            // Some EPUBs store page count in <meta name="..." content="...">
            const metaElements = metadata.meta;
            if (metaElements) {
                const metas = Array.isArray(metaElements) ? metaElements : [metaElements];
                for (const m of metas) {
                    if (m && m.$ && m.$.name && m.$.name.toLowerCase().includes('page') && m.$.content) {
                        const parsed = parseInt(m.$.content);
                        if (!isNaN(parsed) && parsed > 0) {
                            pageListCount = parsed;
                            console.log(`📖 [EPUB] Found page count in OPF meta: ${pageListCount}`);
                            break;
                        }
                    }
                }
            }
        }

        // =========================================================
        // STRATEGY 4: Word count estimation (fallback)
        // =========================================================
        if (pageListCount > 0) {
            info.pages = pageListCount;
        } else {
            // Fallback: estimate from word count
            let totalWords = 0;
            const idToHref = {};
            manifestItems.forEach(item => {
                idToHref[item.$.id] = item.$.href;
            });

            for (const item of spine) {
                const idref = item.$.idref;
                let href = idToHref[idref];

                if (href) {
                    const fullPath = opfDir ? `${opfDir}/${href}` : href;
                    const fileEntry = zipEntries.find(entry => entry.entryName === fullPath || entry.entryName === decodeURIComponent(fullPath));

                    if (fileEntry) {
                        const content = fileEntry.getData().toString('utf8');
                        const text = content.replace(/<[^>]*>/g, ' ');
                        const words = text.trim().split(/\s+/).length;
                        totalWords += words;
                    }
                }
            }

            info.pages = Math.ceil(totalWords / 250);
            console.log(`📖 [EPUB] No page-list found, estimated ${info.pages} pages from ${totalWords} words`);
        }

        return info;

    } catch (error) {
        console.error('Error extracting metadata:', error);
        return null;
    }
}

module.exports = {
    createMiniEpub,
    extractMetadata
};
