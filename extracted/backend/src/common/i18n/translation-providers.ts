import { createHash } from 'node:crypto';
import { Locale, SOURCE_LOCALE } from './i18n.types';

/**
 * Pluggable translation backend. Implementations:
 *   - NoopProvider     : returns input unchanged (used when no
 *                        external service is configured — keeps the
 *                        platform fully offline-capable).
 *   - LibreProvider    : self-hosted LibreTranslate.
 *   - DeepLProvider    : DeepL API.
 *   - OpenAIProvider   : LLM fallback for low-resource pairs.
 *
 * Selection is driven by env vars; if multiple are configured, the
 * provider listed first in TRANSLATION_PROVIDERS wins.
 */
export interface TranslationRequest {
  text: string;
  from: Locale;
  to: Locale;
}

export interface TranslationResult {
  text: string;
  provider: string;
}

export interface ITranslationProvider {
  readonly name: string;
  supports(from: Locale, to: Locale): boolean;
  translate(req: TranslationRequest): Promise<TranslationResult>;
}

export class NoopProvider implements ITranslationProvider {
  readonly name = 'noop';
  supports(): boolean {
    return true;
  }
  async translate(req: TranslationRequest): Promise<TranslationResult> {
    return { text: req.text, provider: this.name };
  }
}

export class LibreProvider implements ITranslationProvider {
  readonly name = 'libre';
  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}
  supports(): boolean {
    return true;
  }
  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const url = `${this.endpoint.replace(/\/$/, '')}/translate`;
    const body = {
      q: req.text,
      source: req.from,
      target: req.to,
      format: 'text',
      ...(this.apiKey ? { api_key: this.apiKey } : {}),
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`libre ${res.status}`);
    const json = (await res.json()) as { translatedText?: string };
    if (!json.translatedText) throw new Error('libre empty response');
    return { text: json.translatedText, provider: this.name };
  }
}

export class DeepLProvider implements ITranslationProvider {
  readonly name = 'deepl';
  constructor(private readonly apiKey: string, private readonly free = false) {}
  supports(_from: Locale, to: Locale): boolean {
    // DeepL does not support Arabic as a target reliably; keep it for
    // EN/FR/PT pairs only and let another provider fill in Arabic.
    return to !== 'ar';
  }
  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const host = this.free ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const res = await fetch(`${host}/v2/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
      },
      body: new URLSearchParams({
        text: req.text,
        source_lang: req.from.toUpperCase(),
        target_lang: req.to.toUpperCase(),
      }),
    });
    if (!res.ok) throw new Error(`deepl ${res.status}`);
    const json = (await res.json()) as { translations?: { text: string }[] };
    const out = json.translations?.[0]?.text;
    if (!out) throw new Error('deepl empty response');
    return { text: out, provider: this.name };
  }
}

export class OpenAIProvider implements ITranslationProvider {
  readonly name = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
  ) {}
  supports(): boolean {
    return true;
  }
  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const langName: Record<Locale, string> = {
      ar: 'Egyptian Arabic',
      en: 'English',
      fr: 'French',
      pt: 'Portuguese',
    };
    const messages = [
      {
        role: 'system',
        content:
          'You are a professional localizer for a transit app in Egypt. ' +
          'Translate the user message preserving meaning, place names ' +
          'as commonly written, numbers, prices in EGP, and informal tone. ' +
          'Reply with translation only, no quotes, no commentary.',
      },
      {
        role: 'user',
        content: `Translate from ${langName[req.from]} to ${langName[req.to]}:\n${req.text}`,
      },
    ];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = json.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('openai empty response');
    return { text: out, provider: this.name };
  }
}

export function buildProviderChain(): ITranslationProvider[] {
  const chain: ITranslationProvider[] = [];
  if (process.env.LIBRETRANSLATE_URL) {
    chain.push(new LibreProvider(process.env.LIBRETRANSLATE_URL, process.env.LIBRETRANSLATE_API_KEY));
  }
  if (process.env.DEEPL_API_KEY) {
    chain.push(new DeepLProvider(process.env.DEEPL_API_KEY, process.env.DEEPL_FREE === '1'));
  }
  if (process.env.OPENAI_API_KEY) {
    chain.push(new OpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_TRANSLATION_MODEL));
  }
  chain.push(new NoopProvider());
  return chain;
}

export function hashSource(text: string, sourceLocale: Locale = SOURCE_LOCALE): string {
  return createHash('sha256').update(`${sourceLocale}::${text}`).digest('hex');
}
