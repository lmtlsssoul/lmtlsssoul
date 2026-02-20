import { Agent, AgentRole } from './types.ts';

interface ScrapeContext {
  url: string;
  targetSelector?: string;
  timeoutMs?: number;
}

interface ScrapeResult {
  url: string;
  content: string;
  scrapedAt: string;
}

export class Scraper implements Agent {
  public readonly role: AgentRole = 'scraper';

  public async execute(context: ScrapeContext): Promise<ScrapeResult> {
    const target = validateUrl(context.url);
    const timeoutMs = context.timeoutMs ?? 15000;
    const html = await fetchHtml(target, timeoutMs);
    const content = this.parseContent(html, context.targetSelector);

    return {
      url: target,
      content,
      scrapedAt: new Date().toISOString(),
    };
  }

  private parseContent(html: string, selector?: string): string {
    if (selector) {
      const selected = extractBySelector(html, selector);
      if (selected) {
        return normalizeWhitespace(stripHtml(selected));
      }
    }

    const withoutScripts = html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ');
    return normalizeWhitespace(stripHtml(withoutScripts)).slice(0, 20000);
  }
}

function validateUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are supported.');
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'lmtlss-soul-scraper/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while scraping ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractBySelector(html: string, selector: string): string | null {
  if (!selector) return null;

  if (selector.startsWith('#')) {
    const id = escapeRegex(selector.slice(1));
    const match = new RegExp(`<([a-z0-9]+)[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i').exec(html);
    return match?.[2] ?? null;
  }

  if (selector.startsWith('.')) {
    const className = escapeRegex(selector.slice(1));
    const match = new RegExp(
      `<([a-z0-9]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'i'
    ).exec(html);
    return match?.[2] ?? null;
  }

  const tag = selector.toLowerCase();
  const tagMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html);
  return tagMatch?.[1] ?? null;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
