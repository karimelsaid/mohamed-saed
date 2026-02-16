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

        const parser = new xml2js.Parser();
        const containerData = await parser.parseStringPromise(containerEntry.getData().toString('utf8'));
        const rootPath = containerData.container.rootfiles[0].rootfile[0].$['full-path'];

        // Find OPF file
        const opfEntry = zipEntries.find(entry => entry.entryName === rootPath);
        if (!opfEntry) throw new Error(`Invalid EPUB: OPF file ${rootPath} not found`);

        const opfData = await parser.parseStringPromise(opfEntry.getData().toString('utf8'));
        const metadata = opfData.package.metadata[0];

        // Extract Basic Info
        const info = {
            title: metadata['dc:title'] ? metadata['dc:title'][0] : null,
            author: metadata['dc:creator'] ? (typeof metadata['dc:creator'][0] === 'object' ? metadata['dc:creator'][0]._ : metadata['dc:creator'][0]) : 'Unknown',
            publisher: metadata['dc:publisher'] ? metadata['dc:publisher'][0] : null,
            language: metadata['dc:language'] ? metadata['dc:language'][0] : null,
            description: metadata['dc:description'] ? metadata['dc:description'][0] : null,
            pages: 0
        };

        // Estimate Pages (Word Count / 250)
        let totalWords = 0;
        const manifest = opfData.package.manifest[0].item;
        const spine = opfData.package.spine[0].itemref;

        // Map spine idrefs to file paths
        const idToHref = {};
        manifest.forEach(item => {
            idToHref[item.$.id] = item.$.href;
        });

        // Resolve absolute paths for spine items relative to OPF location
        const opfDir = rootPath.substring(0, rootPath.lastIndexOf('/'));

        for (const item of spine) {
            const idref = item.$.idref;
            let href = idToHref[idref];

            if (href) {
                // Handle relative paths
                const fullPath = opfDir ? `${opfDir}/${href}` : href;
                const fileEntry = zipEntries.find(entry => entry.entryName === fullPath || entry.entryName === decodeURIComponent(fullPath));

                if (fileEntry) {
                    const content = fileEntry.getData().toString('utf8');
                    // Remove HTML tags
                    const text = content.replace(/<[^>]*>/g, ' ');
                    // Count words
                    const words = text.trim().split(/\s+/).length;
                    totalWords += words;
                }
            }
        }

        info.pages = Math.ceil(totalWords / 250); // Standard estimate
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
