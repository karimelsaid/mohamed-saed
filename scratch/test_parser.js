function parseEbookFileName(fileName) {
    // Remove extension
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    
    // Split by '--'
    const parts = nameWithoutExt.split('--').map(p => p.trim());
    
    let bookName = '';
    let author = '';
    let description = '';
    
    if (parts.length > 0) {
        // First part has the book name and potentially its description/sub-title
        const firstPart = parts[0];
        // Split by Arabic semicolon '؛' or English semicolon ';'
        const subParts = firstPart.split(/[؛;]/).map(sp => sp.trim());
        bookName = subParts[0] || '';
        
        if (subParts.length > 1) {
            description = subParts.slice(1).join('؛ ').trim();
        }
    }
    
    if (parts.length > 1) {
        author = parts[1] || '';
    }
    
    // If there's no description, fallback to author name or book name
    if (!description) {
        description = author || bookName;
    }
    
    return {
        bookName,
        author,
        description
    };
}

// Test cases
const testCases = [
    {
        filename: "هل أنت غبي عاطفياً؛ رحلة التغيير لفهم نفسك وتحسين علاقتك -- نانسي صميدة -- ( WeLib.org ).epub",
        expected: {
            bookName: "هل أنت غبي عاطفياً",
            author: "نانسي صميدة",
            description: "رحلة التغيير لفهم نفسك وتحسين علاقتك"
        }
    },
    {
        filename: "علاقات خطرة Dangerous Relationships -- د. محمد طه -- ( WeLib.org ).epub",
        expected: {
            bookName: "علاقات خطرة Dangerous Relationships",
            author: "د. محمد طه",
            description: "د. محمد طه"
        }
    },
    {
        filename: "لانك الله -- علي جابر الفيفي.epub",
        expected: {
            bookName: "لانك الله",
            author: "علي جابر الفيفي",
            description: "علي جابر الفيفي"
        }
    },
    {
        filename: "مقدمة ابن خلدون.epub",
        expected: {
            bookName: "مقدمة ابن خلدون",
            author: "",
            description: "مقدمة ابن خلدون"
        }
    }
];

let failed = false;
testCases.forEach((tc, idx) => {
    const result = parseEbookFileName(tc.filename);
    console.log(`\nTest Case ${idx + 1}: ${tc.filename}`);
    console.log("Result:  ", JSON.stringify(result));
    console.log("Expected:", JSON.stringify(tc.expected));
    
    const pass = result.bookName === tc.expected.bookName && 
                 result.author === tc.expected.author && 
                 result.description === tc.expected.description;
                 
    if (pass) {
        console.log("✅ Passed");
    } else {
        console.log("❌ Failed");
        failed = true;
    }
});

if (failed) {
    process.exit(1);
} else {
    console.log("\n🎉 All parser unit tests passed perfectly!");
}
