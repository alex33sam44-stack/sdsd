import type { AiTask } from './ai.types';

/**
 * Pluggable LLM providers for the AI gateway.
 *
 * Each provider implements the same minimal contract so the gateway
 * can pick whichever is configured. The deterministic fallback at
 * the end of the chain guarantees the API never returns 5xx; it
 * just degrades to a templated answer when no model is reachable.
 */

export interface AiProviderRequest {
  task: AiTask;
  locale: string;
  systemPrompt: string;
  userPrompt: string;
  /** Hard ceiling for output tokens; providers may apply lower limits. */
  maxOutputTokens?: number;
  /** Sampling temperature; 0–1 typical, 0.2 default. */
  temperature?: number;
}

export interface AiProviderResult {
  text: string;
  provider: string;
}

export interface AiProvider {
  readonly name: string;
  readonly fallback?: boolean;
  invoke(req: AiProviderRequest): Promise<AiProviderResult>;
}

const LANG_NAME: Record<string, string> = {
  ar: 'Egyptian Arabic',
  en: 'English',
  fr: 'French',
  pt: 'Portuguese',
};

function langName(locale: string): string {
  return LANG_NAME[locale] ?? 'English';
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-4o-mini',
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async invoke(req: AiProviderRequest): Promise<AiProviderResult> {
    const res = await this.fetcher('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens ?? 400,
        messages: [
          { role: 'system', content: `${req.systemPrompt}\nRespond strictly in ${langName(req.locale)}.` },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('openai empty response');
    return { text, provider: this.name };
  }
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-3-5-haiku-20241022',
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async invoke(req: AiProviderRequest): Promise<AiProviderResult> {
    const res = await this.fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxOutputTokens ?? 400,
        temperature: req.temperature ?? 0.2,
        system: `${req.systemPrompt}\nRespond strictly in ${langName(req.locale)}.`,
        messages: [{ role: 'user', content: req.userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as { content?: { text?: string }[] };
    const text = json.content?.[0]?.text?.trim();
    if (!text) throw new Error('anthropic empty response');
    return { text, provider: this.name };
  }
}

export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'meta-llama/llama-3.1-8b-instruct',
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async invoke(req: AiProviderRequest): Promise<AiProviderResult> {
    const res = await this.fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens ?? 400,
        messages: [
          { role: 'system', content: `${req.systemPrompt}\nRespond strictly in ${langName(req.locale)}.` },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('openrouter empty response');
    return { text, provider: this.name };
  }
}

/**
 * Deterministic fallback. Returns a templated answer in the request
 * locale so the API is always usable, even on offline / unconfigured
 * environments. Output is intentionally short and never hallucinated.
 */
export class NoopProvider implements AiProvider {
  readonly name = 'noop';
  readonly fallback = true;
  async invoke(req: AiProviderRequest): Promise<AiProviderResult> {
    const map: Record<string, Record<AiTask, string>> = {
      ar: {
        ask: 'لتقديم إجابة دقيقة، اضبط مفتاح OPENAI_API_KEY أو ANTHROPIC_API_KEY على الخادم. أعطنا تفاصيل الموقف والوجهة وسنرد بأفضل خطّ متاح.',
        explain: 'هذه الرحلة تجمع موقفك ووجهتك بأفضل خط متاح حاليًا. سيُعرض الزمن والأجرة عند توفر بيانات حية.',
        suggest: 'بدائل مقترحة: نفس الخط في وقت أبكر، أو استخدام التاكسي إذا كان الخط مزدحمًا، أو الانتظار لميكروباص تالٍ.',
      },
      en: {
        ask: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the server for richer answers. Tell us the stop and destination and we will reply with the best available line.',
        explain: 'This trip pairs your stop with the destination using the best line available right now. Real-time time and fare appear once live data is in.',
        suggest: 'Suggestions: take the same line earlier, switch to a taxi if the line is crowded, or wait for the next microbus.',
      },
      fr: {
        ask: 'Définissez OPENAI_API_KEY ou ANTHROPIC_API_KEY côté serveur pour des réponses plus riches. Indiquez l’arrêt et la destination, nous proposerons la meilleure ligne disponible.',
        explain: 'Ce trajet relie votre arrêt à la destination via la meilleure ligne disponible. Le temps et le tarif réels s’affichent dès que les données sont disponibles.',
        suggest: 'Suggestions : prendre la même ligne plus tôt, basculer en taxi si la ligne est saturée, ou attendre le prochain microbus.',
      },
      pt: {
        ask: 'Defina OPENAI_API_KEY ou ANTHROPIC_API_KEY no servidor para respostas mais detalhadas. Diga a parada e o destino e indicamos a melhor linha disponível.',
        explain: 'Esta viagem conecta sua parada ao destino pela melhor linha disponível agora. Tempo e tarifa em tempo real aparecem assim que os dados chegam.',
        suggest: 'Sugestões: pegar a mesma linha mais cedo, alternar para táxi se estiver cheio, ou aguardar o próximo micro-ônibus.',
      },
    };
    const bucket = map[req.locale] ?? map.en;
    return { text: bucket[req.task] ?? bucket.ask, provider: this.name };
  }
}

export function buildProviderChain(): AiProvider[] {
  const chain: AiProvider[] = [];
  if (process.env.OPENAI_API_KEY) {
    chain.push(new OpenAiProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_AI_MODEL));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    chain.push(new AnthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AI_MODEL));
  }
  if (process.env.OPENROUTER_API_KEY) {
    chain.push(new OpenRouterProvider(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_AI_MODEL));
  }
  chain.push(new NoopProvider());
  return chain;
}
