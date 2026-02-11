type GeminiModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

const RAW_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '';
const GEMINI_API_KEY = RAW_API_KEY.trim();

const DEFAULT_TEXT_MODEL = (import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined)?.trim() || 'gemini-1.5-flash';
const DEFAULT_VISION_MODEL = (import.meta.env.VITE_GEMINI_VISION_MODEL as string | undefined)?.trim() || 'gemini-1.5-flash';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_PREFERENCE_TEXT = ['models/gemini-1.5-flash', 'models/gemini-1.5-pro', 'models/gemini-pro'];
const MODEL_PREFERENCE_VISION = ['models/gemini-1.5-flash', 'models/gemini-1.5-pro', 'models/gemini-pro-vision'];

let cachedModels: { text?: string; vision?: string; fetchedAt?: number } = {};
let modelListCache: { models: GeminiModel[]; fetchedAt: number } | null = null;

const isPlaceholderKey = (value: string) => /YOUR_|PASTE_|REPLACE_/i.test(value);

export const isGeminiConfigured = () => Boolean(GEMINI_API_KEY) && !isPlaceholderKey(GEMINI_API_KEY);

const listModels = async (signal?: AbortSignal): Promise<GeminiModel[]> => {
  if (modelListCache && Date.now() - modelListCache.fetchedAt < 15 * 60 * 1000) {
    return modelListCache.models;
  }
  const res = await fetch(`${API_BASE}/models?key=${GEMINI_API_KEY}`, { signal });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Model fetch failed');
  }
  const models = (data.models || []) as GeminiModel[];
  modelListCache = { models, fetchedAt: Date.now() };
  return models;
};

const pickModel = (models: GeminiModel[], preferred: string[], fallback: string) => {
  if (!models.length) return fallback;
  const valid = models.filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
  const chosen = preferred.find((name) => valid.some((model) => model.name === name)) || valid[0]?.name;
  return (chosen || fallback).replace('models/', '');
};

export const getGeminiTextModel = async (signal?: AbortSignal) => {
  if (!isGeminiConfigured()) return DEFAULT_TEXT_MODEL;
  if (cachedModels.text) return cachedModels.text;
  const models = await listModels(signal);
  const picked = pickModel(models, MODEL_PREFERENCE_TEXT, DEFAULT_TEXT_MODEL);
  cachedModels.text = picked;
  return picked;
};

export const getGeminiVisionModel = async (signal?: AbortSignal) => {
  if (!isGeminiConfigured()) return DEFAULT_VISION_MODEL;
  if (cachedModels.vision) return cachedModels.vision;
  const models = await listModels(signal);
  const picked = pickModel(models, MODEL_PREFERENCE_VISION, DEFAULT_VISION_MODEL);
  cachedModels.vision = picked;
  return picked;
};

const callGemini = async ({
  model,
  body,
  signal,
}: {
  model: string;
  body: unknown;
  signal?: AbortSignal;
}) => {
  const res = await fetch(`${API_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'AI request failed');
  }
  return data;
};

export const generateText = async ({
  prompt,
  model,
  signal,
  temperature = 0.3,
  maxOutputTokens = 256,
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}) => {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key missing');
  }
  const modelName = model || (await getGeminiTextModel(signal));
  const data = await callGemini({
    model: modelName,
    signal,
    body: {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    },
  });
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof reply === 'string' ? reply.trim() : '';
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

export const generateJson = async <T,>({
  prompt,
  model,
  signal,
  temperature = 0.2,
  maxOutputTokens = 512,
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}) => {
  const text = await generateText({ prompt, model, signal, temperature, maxOutputTokens });
  const jsonText = extractJsonText(text);
  if (!jsonText) {
    throw new Error('AI did not return JSON');
  }
  return JSON.parse(jsonText) as T;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });

export const verifyFoodImage = async ({
  file,
  signal,
}: {
  file: File;
  signal?: AbortSignal;
}) => {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key missing');
  }
  const base64Data = await fileToBase64(file);
  const modelName = await getGeminiVisionModel(signal);
  const data = await callGemini({
    model: modelName,
    signal,
    body: {
      contents: [
        {
          parts: [
            {
              text: "Look at this image. Is this real, edible cooked food or raw ingredients suitable for donation? If it is food, return ONLY the word 'YES'. If it is a person, object, blur, or inappropriate, return 'NO'.",
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
    },
  });
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.toUpperCase() || '';
  return reply.includes('YES');
};
