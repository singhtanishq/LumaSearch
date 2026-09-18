/**
 * LLM adapter interface + implementations (OpenAI, Anthropic, Ollama, disabled).
 * All answer synthesis goes through this boundary so providers stay swappable.
 */
import { withBackoff } from '@luma-search/utils';

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface Generation {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(messages: PromptMessage[], options?: GenerateOptions): Promise<Generation>;
}

export class DisabledLLMProvider implements LLMProvider {
  readonly name = 'disabled';
  readonly model = 'none';
  async generate(): Promise<Generation> {
    throw new Error('LLM generation is disabled (LLM_PROVIDER=disabled)');
  }
}

export interface OpenAIConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIChatProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;

  constructor(private readonly cfg: OpenAIConfig) {
    if (!cfg.apiKey) throw new Error('OpenAIChatProvider requires OPENAI_API_KEY');
    this.model = cfg.model ?? 'gpt-4o-mini';
  }

  async generate(messages: PromptMessage[], options: GenerateOptions = {}): Promise<Generation> {
    const res = await withBackoff(
      async () => {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: options.maxTokens ?? this.cfg.maxTokens ?? 4096,
            temperature: options.temperature ?? this.cfg.temperature ?? 0.1,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
        if (!r.ok) throw new Error(`openai chat HTTP ${r.status}`);
        return r.json() as Promise<{
          choices: Array<{ message: { content: string } }>;
          usage: { prompt_tokens: number; completion_tokens: number };
        }>;
      },
      { attempts: 2, initialMs: 1000 }
    );
    return {
      text: res.choices[0]?.message?.content ?? '',
      model: this.model,
      usage: {
        promptTokens: res.usage.prompt_tokens,
        completionTokens: res.usage.completion_tokens,
      },
    };
  }
}

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicChatProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(private readonly cfg: AnthropicConfig) {
    if (!cfg.apiKey) throw new Error('AnthropicChatProvider requires ANTHROPIC_API_KEY');
    this.model = cfg.model ?? 'claude-3-haiku-20240307';
  }

  async generate(messages: PromptMessage[], options: GenerateOptions = {}): Promise<Generation> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const res = await withBackoff(
      async () => {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.cfg.apiKey ?? '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            system,
            messages: rest.map((m) => ({ role: m.role, content: m.content })),
            max_tokens: options.maxTokens ?? this.cfg.maxTokens ?? 4096,
            temperature: options.temperature ?? this.cfg.temperature ?? 0.1,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
        if (!r.ok) throw new Error(`anthropic HTTP ${r.status}`);
        return r.json() as Promise<{
          content: Array<{ text: string }>;
          usage: { input_tokens: number; output_tokens: number };
        }>;
      },
      { attempts: 2, initialMs: 1000 }
    );
    return {
      text: res.content.map((c) => c.text).join(''),
      model: this.model,
      usage: {
        promptTokens: res.usage.input_tokens,
        completionTokens: res.usage.output_tokens,
      },
    };
  }
}

export interface OllamaConfig {
  url?: string;
  model?: string;
}

export class OllamaChatProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;

  constructor(private readonly cfg: OllamaConfig) {
    this.model = cfg.model ?? 'llama3.1:8b';
  }

  async generate(messages: PromptMessage[], options: GenerateOptions = {}): Promise<Generation> {
    const url = this.cfg.url ?? 'http://localhost:11434';
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          num_predict: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.1,
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = (await res.json()) as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      text: data.message?.content ?? '',
      model: this.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }
}

export type LLMProviderKind = 'openai' | 'anthropic' | 'ollama' | 'disabled';

export interface LLMFactoryConfig {
  provider: LLMProviderKind;
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  ollama?: OllamaConfig;
}

export function createLLMProvider(cfg: LLMFactoryConfig): LLMProvider {
  switch (cfg.provider) {
    case 'openai':
      return new OpenAIChatProvider(cfg.openai ?? {});
    case 'anthropic':
      return new AnthropicChatProvider(cfg.anthropic ?? {});
    case 'ollama':
      return new OllamaChatProvider(cfg.ollama ?? {});
    case 'disabled':
    default:
      return new DisabledLLMProvider();
  }
}