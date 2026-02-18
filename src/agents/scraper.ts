/**
 * @file src/agents/scraper.ts
 * @description The scraper agent for web scraping and data collection.
 * @auth lmtlss soul
 */

import { Agent, AgentRole } from './types.ts';

/**
 * Represents the context required for a scraping task.
 */
interface ScrapeContext {
  url: string;
  targetSelector?: string; // Optional CSS selector to target specific content
}

/**
 * Represents the result of a scraping task.
 */
interface ScrapeResult {
  url: string;
  content: string; // The scraped content, e.g., raw HTML or extracted text
  scrapedAt: string;
}

/**
 * The Scraper agent is responsible for fetching and extracting data from web pages.
 * It is designed to be a cost-effective way to gather information for research
 * and other tasks.
 */
export class Scraper implements Agent {
  public readonly role: AgentRole = 'scraper';

  /**
   * Executes a scraping task based on the provided context.
   * @param context - The context containing the URL to scrape and optional selectors.
   * @returns A promise that resolves with the scraped content.
   */
  public async execute(context: ScrapeContext): Promise<ScrapeResult> {
    console.log(`[Scraper] Received task to scrape: ${context.url}`);

    try {
      // In a real implementation, this would use a library like fetch, axios,
      // puppeteer, or similar to get the web content.
      // For this conceptual implementation, we'll return a mock result.

      const mockContent = `<html><head><title>Mock Page</title></head><body><h1>Hello from ${context.url}</h1></body></html>`;

      const result: ScrapeResult = {
        url: context.url,
        content: this.parseContent(mockContent, context.targetSelector),
        scrapedAt: new Date().toISOString(),
      };

      console.log(`[Scraper] Successfully scraped: ${context.url}`);
      return result;
    } catch (error) {
      console.error(`[Scraper] Failed to scrape ${context.url}:`, error);
      throw new Error(`Failed to scrape ${context.url}`);
    }
  }

  /**
   * Parses the raw HTML content to extract the desired information.
   * @param html - The raw HTML content of the page.
   * @param selector - An optional CSS selector to target specific content.
   * @returns The extracted content.
   */
  private parseContent(html: string, selector?: string): string {
    // This is a placeholder for a more sophisticated parsing logic.
    // A real implementation might use a library like Cheerio or JSDOM
    // to parse the HTML and extract content based on the selector.
    if (selector) {
      return `(Content matching selector '${selector}' from the HTML would be here.)`;
    }

    return html; // Return the full HTML if no selector is provided.
  }
}
