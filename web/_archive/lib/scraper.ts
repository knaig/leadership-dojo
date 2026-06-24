export async function scrapeUrl(url: string) {
    try {
        console.log(`[Scraper] Fetching: ${url}`);
        const res = await fetch(url);
        const html = await res.text();

        // Regex Extraction
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled Article";

        // Naive Body Text Extraction (Remove HTML tags)
        // 1. Remove Scripts/Styles
        let cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // 2. Remove Tags
        const rawText = cleanHtml.replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 15000);

        return { title, rawText };
    } catch (e) {
        console.error("Scraping failed:", e);
        return { title: "", rawText: "" };
    }
}
