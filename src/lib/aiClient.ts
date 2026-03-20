type GeminiModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

type GeminiSchemaType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export type GeminiFeature = 'default' | 'chat' | 'recipe' | 'donor' | 'receiver' | 'admin';

export type GeminiResponseSchema = {
  type: GeminiSchemaType;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  format?: string;
  properties?: Record<string, GeminiResponseSchema>;
  items?: GeminiResponseSchema;
  required?: string[];
};

const stripModelPrefix = (value: string) => value.replace(/^models\//, '');

const LEGACY_MODEL_MAP: Record<string, string> = {
  'gemini-1.0-pro': 'gemini-2.5-pro',
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash-8b': 'gemini-2.5-flash-lite',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash-image': 'gemini-2.5-flash',
  'gemini-2.5-flash-preview-image': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-pro-vision': 'gemini-2.5-flash',
  'gemini-3.1-flash-image-preview': 'gemini-2.5-flash',
};

const normalizeConfiguredModel = (value: string | undefined, fallback: string) => {
  const trimmed = stripModelPrefix((value || '').trim());
  if (!trimmed) return fallback;
  return LEGACY_MODEL_MAP[trimmed] || trimmed;
};

const ENV = import.meta.env as Record<string, string | undefined>;
const readEnvValue = (...keys: string[]) =>
  keys
    .map((key) => (ENV[key] || '').trim())
    .find(Boolean) || '';

const GEMINI_API_KEYS: Record<GeminiFeature, string> = {
  default: readEnvValue('VITE_GEMINI_API_KEY'),
  chat: readEnvValue('VITE_GEMINI_API_KEY_CHAT', 'VITE_GEMINI_API_KEY_CHAT_WIDGET'),
  recipe: readEnvValue('VITE_GEMINI_API_KEY_RECIPE_HUB', 'VITE_GEMINI_API_KEY_RECIPE'),
  donor: readEnvValue('VITE_GEMINI_API_KEY_DONOR', 'VITE_GEMINI_API_KEY_DONOR_DASHBOARD'),
  receiver: readEnvValue('VITE_GEMINI_API_KEY_RECEIVER', 'VITE_GEMINI_API_KEY_NGO'),
  admin: readEnvValue('VITE_GEMINI_API_KEY_ADMIN'),
};

const getGeminiApiKey = (feature: GeminiFeature = 'default') => GEMINI_API_KEYS[feature] || GEMINI_API_KEYS.default;

const DEFAULT_TEXT_MODEL = normalizeConfiguredModel(
  import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined,
  'gemini-2.5-flash'
);
const DEFAULT_VISION_MODEL = normalizeConfiguredModel(
  import.meta.env.VITE_GEMINI_VISION_MODEL as string | undefined,
  DEFAULT_TEXT_MODEL
);

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_PREFERENCE_TEXT = [
  'models/gemini-2.5-flash',
  'models/gemini-flash-latest',
  'models/gemini-2.5-flash-lite',
  'models/gemini-2.0-flash-lite',
  'models/gemini-2.0-flash',
  'models/gemini-2.5-pro',
  'models/gemini-pro-latest',
];
const MODEL_PREFERENCE_VISION = [
  'models/gemini-2.5-flash',
  'models/gemini-flash-latest',
  'models/gemini-2.0-flash',
  'models/gemini-2.0-flash-001',
  'models/gemini-2.5-pro',
];

const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedModels: Partial<Record<GeminiFeature, { text?: string; vision?: string }>> = {};
let modelListCache: Partial<Record<GeminiFeature, { models: GeminiModel[]; fetchedAt: number }>> = {};

const isPlaceholderKey = (value: string) => /YOUR_|PASTE_|REPLACE_/i.test(value);
const normalizeModelName = (value: string) => (value.startsWith('models/') ? value : `models/${value}`);
const getFeatureModelCache = (feature: GeminiFeature) => {
  if (!cachedModels[feature]) {
    cachedModels[feature] = {};
  }
  return cachedModels[feature] as { text?: string; vision?: string };
};
const updateCachedModel = (feature: GeminiFeature, currentModel: string, nextModel: string) => {
  const cache = getFeatureModelCache(feature);
  if (cache.text === currentModel) cache.text = nextModel;
  if (cache.vision === currentModel) cache.vision = nextModel;
};

export const isGeminiConfigured = (feature: GeminiFeature = 'default') => {
  const apiKey = getGeminiApiKey(feature);
  return Boolean(apiKey) && !isPlaceholderKey(apiKey);
};

const ensureGeminiConfigured = (feature: GeminiFeature = 'default') => {
  if (!isGeminiConfigured(feature)) {
    throw new Error('Gemini API key missing');
  }
};

const buildPromptText = (prompt: string, systemInstruction?: string) => {
  const cleanedPrompt = prompt.trim();
  const cleanedInstruction = systemInstruction?.trim();
  if (!cleanedInstruction) return cleanedPrompt;
  return `${cleanedInstruction}\n\nUser request:\n${cleanedPrompt}`;
};

const listModels = async (signal?: AbortSignal, feature: GeminiFeature = 'default'): Promise<GeminiModel[]> => {
  const apiKey = getGeminiApiKey(feature);
  ensureGeminiConfigured(feature);

  const cache = modelListCache[feature];
  if (cache && Date.now() - cache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cache.models;
  }

  const res = await fetch(`${API_BASE}/models`, {
    signal,
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Model fetch failed');
  }

  const models = Array.isArray(data.models) ? (data.models as GeminiModel[]) : [];
  modelListCache[feature] = { models, fetchedAt: Date.now() };
  return models;
};

const pickModel = (models: GeminiModel[], preferred: string[], fallback: string) => {
  if (!models.length) return fallback;

  const valid = models.filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
  if (!valid.length) return fallback;

  const preferredWithFallback = [...preferred, normalizeModelName(fallback)];
  const chosen = preferredWithFallback.find((name) => valid.some((model) => model.name === name)) || valid[0]?.name;
  return stripModelPrefix(chosen || fallback);
};

const resolveModel = async ({
  cacheKey,
  preferred,
  fallback,
  signal,
  feature = 'default',
}: {
  cacheKey: 'text' | 'vision';
  preferred: string[];
  fallback: string;
  signal?: AbortSignal;
  feature?: GeminiFeature;
}) => {
  if (!isGeminiConfigured(feature)) return fallback;

  const cache = getFeatureModelCache(feature);
  if (cache[cacheKey]) return cache[cacheKey] as string;

  try {
    const models = await listModels(signal, feature);
    const picked = pickModel(models, preferred, fallback);
    cache[cacheKey] = picked;
    return picked;
  } catch (error) {
    console.warn(`Gemini model lookup failed for ${cacheKey}, using fallback model.`, error);
    cache[cacheKey] = fallback;
    return fallback;
  }
};

export const getGeminiTextModel = async (signal?: AbortSignal, feature: GeminiFeature = 'default') =>
  resolveModel({
    cacheKey: 'text',
    preferred: MODEL_PREFERENCE_TEXT,
    fallback: DEFAULT_TEXT_MODEL,
    signal,
    feature,
  });

export const getGeminiVisionModel = async (signal?: AbortSignal, feature: GeminiFeature = 'default') =>
  resolveModel({
    cacheKey: 'vision',
    preferred: MODEL_PREFERENCE_VISION,
    fallback: DEFAULT_VISION_MODEL,
    signal,
    feature,
  });

const callGemini = async ({
  model,
  contents,
  signal,
  temperature = 0.3,
  maxOutputTokens = 256,
  responseMimeType,
  responseSchema,
  retryModel,
  thinkingBudget,
  feature = 'default',
}: {
  model: string;
  contents: unknown[];
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: GeminiResponseSchema;
  retryModel?: string;
  thinkingBudget?: number;
  feature?: GeminiFeature;
}) => {
  const apiKey = getGeminiApiKey(feature);
  ensureGeminiConfigured(feature);

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  };

  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType;
  }

  if (responseSchema) {
    generationConfig.responseMimeType = responseMimeType || 'application/json';
    generationConfig.responseSchema = responseSchema;
  }

  if (typeof thinkingBudget === 'number') {
    generationConfig.thinkingConfig = { thinkingBudget };
  }

  const makeRequest = async (modelName: string) =>
    fetch(`${API_BASE}/models/${modelName}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig,
      }),
      signal,
    });

  const currentModel = stripModelPrefix(model);
  const fallbackModel = retryModel ? stripModelPrefix(retryModel) : null;

  let res = await makeRequest(currentModel);
  let data = (await res.json()) as GeminiGenerateResponse & { error?: { message?: string } };

  const errorMessage = data?.error?.message || '';
  const shouldRetry =
    !res.ok
    && Boolean(fallbackModel)
    && fallbackModel !== currentModel
    && (
      res.status === 404
      || (res.status === 429 && /quota|rate.?limit|resource exhausted|exceeded/i.test(errorMessage))
    );

  // Retry once with a current stable model when old or quota-blocked model aliases fail.
  if (shouldRetry && fallbackModel) {
    updateCachedModel(feature, currentModel, fallbackModel);
    res = await makeRequest(fallbackModel);
    data = (await res.json()) as GeminiGenerateResponse & { error?: { message?: string } };
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || 'AI request failed');
  }

  return data;
};

const extractCandidateText = (data: GeminiGenerateResponse) => {
  if (data.promptFeedback?.blockReason) {
    throw new Error(`AI blocked the request: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.find((entry) => Array.isArray(entry.content?.parts));
  if (!candidate) {
    const fallbackCandidate = data.candidates?.[0];
    if (fallbackCandidate?.finishReason) {
      throw new Error(`AI response stopped: ${fallbackCandidate.finishReason}`);
    }
    throw new Error('AI returned no response');
  }

  if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
    throw new Error(`AI response stopped: ${candidate.finishReason}`);
  }

  const text = candidate.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    // JSON responses can be split across multiple parts mid-property, so avoid injecting separators here.
    .join('')
    .trim();

  if (!text) {
    throw new Error('AI returned an empty response');
  }

  return text;
};

const extractJsonText = (text: string) => {
  const fenced = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const firstObj = raw.indexOf('{');
  const firstArr = raw.indexOf('[');
  const start = firstArr !== -1 && (firstArr < firstObj || firstObj === -1) ? firstArr : firstObj;
  if (start === -1) return null;
  const end = raw.lastIndexOf(start === firstArr ? ']' : '}');
  if (end === -1) return null;
  return raw.slice(start, end + 1).trim();
};

const sanitizeJsonText = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

const tryParseJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const parseJsonResponse = <T,>(text: string) => {
  const extracted = extractJsonText(text);
  const attempts = [text, extracted, sanitizeJsonText(text), extracted ? sanitizeJsonText(extracted) : null]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const attempt of attempts) {
    const parsed = tryParseJson<T>(attempt);
    if (parsed !== null) {
      return parsed;
    }
  }

  throw new Error('AI returned invalid JSON');
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });

const dataUrlToInlineData = (imageDataUrl: string) => {
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data');
  }
  return {
    mimeType: match[1],
    data: match[2],
  };
};

export const generateText = async ({
  prompt,
  model,
  signal,
  temperature = 0.3,
  maxOutputTokens = 256,
  systemInstruction,
  responseMimeType,
  responseSchema,
  thinkingBudget,
  feature = 'default',
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: GeminiResponseSchema;
  thinkingBudget?: number;
  feature?: GeminiFeature;
}) => {
  const modelName = model || (await getGeminiTextModel(signal, feature));
  const data = await callGemini({
    model: modelName,
    signal,
    temperature,
    maxOutputTokens,
    responseMimeType,
    responseSchema,
    retryModel: DEFAULT_TEXT_MODEL,
    thinkingBudget,
    feature,
    contents: [{ parts: [{ text: buildPromptText(prompt, systemInstruction) }] }],
  });

  return extractCandidateText(data);
};

export const generateJson = async <T,>({
  prompt,
  model,
  signal,
  temperature = 0.2,
  maxOutputTokens = 1024,
  systemInstruction,
  schema,
  feature = 'default',
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  schema?: GeminiResponseSchema;
  feature?: GeminiFeature;
}) => {
  const runJsonRequest = async (outputTokens: number) =>
    generateText({
      prompt,
      model,
      signal,
      temperature,
      maxOutputTokens: outputTokens,
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingBudget: 0,
      feature,
    });

  const initialText = await runJsonRequest(maxOutputTokens);

  try {
    return parseJsonResponse<T>(initialText);
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    const retryTokenBudget = Math.max(maxOutputTokens + 600, Math.ceil(maxOutputTokens * 1.5));
    const retriedText = await runJsonRequest(retryTokenBudget);
    return parseJsonResponse<T>(retriedText);
  }
};

export const generateMultimodalText = async ({
  prompt,
  imageDataUrl,
  signal,
  temperature = 0.4,
  maxOutputTokens = 800,
  systemInstruction,
  feature = 'default',
}: {
  prompt: string;
  imageDataUrl?: string | null;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  feature?: GeminiFeature;
}) => {
  if (!imageDataUrl) {
    return generateText({ prompt, signal, temperature, maxOutputTokens, systemInstruction, feature });
  }

  const { mimeType, data } = dataUrlToInlineData(imageDataUrl);
  const modelName = await getGeminiVisionModel(signal, feature);
  const response = await callGemini({
    model: modelName,
    signal,
    temperature,
    maxOutputTokens,
    retryModel: DEFAULT_TEXT_MODEL,
    feature,
    contents: [
      {
        parts: [
          { text: buildPromptText(prompt, systemInstruction) },
          {
            inline_data: {
              mime_type: mimeType,
              data,
            },
          },
        ],
      },
    ],
  });

  return extractCandidateText(response);
};

export const verifyFoodImage = async ({
  file,
  signal,
  feature = 'default',
}: {
  file: File;
  signal?: AbortSignal;
  feature?: GeminiFeature;
}) => {
  ensureGeminiConfigured(feature);
  const base64Data = await fileToBase64(file);
  const modelName = await getGeminiVisionModel(signal, feature);
  const data = await callGemini({
    model: modelName,
    signal,
    temperature: 0,
    maxOutputTokens: 24,
    retryModel: DEFAULT_TEXT_MODEL,
    thinkingBudget: 0,
    feature,
    contents: [
      {
        parts: [
          {
            text:
              "Look at this image. If it shows real cooked food or raw food ingredients suitable for donation, reply with ONLY YES. If it shows a person, object, blur, unsafe content, or non-food item, reply with ONLY NO.",
          },
          {
            inline_data: {
              mime_type: file.type,
              data: base64Data,
            },
          },
        ],
      },
    ],
  });

  const reply = extractCandidateText(data).toUpperCase();
  return reply.includes('YES');
};

export const resetGeminiModelCache = () => {
  cachedModels = {};
  modelListCache = {};
};
