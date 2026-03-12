import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const DEFAULT_TEXT_MODEL = (import.meta.env.VITE_GEMINI_TEXT_MODEL as string | undefined)?.trim() || 'gemini-1.5-flash';
const DEFAULT_VISION_MODEL = (import.meta.env.VITE_GEMINI_VISION_MODEL as string | undefined)?.trim() || 'gemini-1.5-flash';

const generateGeminiTextCallable = httpsCallable<
  { prompt: string; model?: string; temperature?: number; maxOutputTokens?: number },
  { text: string; model: string }
>(functions, 'generateGeminiText');

const verifyFoodImageCallable = httpsCallable<
  { mimeType: string; base64Data: string },
  { isFood: boolean }
>(functions, 'verifyFoodImage');

export const isGeminiConfigured = () => Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID);

export const getGeminiTextModel = async () => DEFAULT_TEXT_MODEL;

export const getGeminiVisionModel = async () => DEFAULT_VISION_MODEL;

export const generateText = async ({
  prompt,
  model,
  signal: _signal,
  temperature = 0.3,
  maxOutputTokens = 256,
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}) => {
  void _signal;
  if (!isGeminiConfigured()) {
    throw new Error('AI proxy not configured');
  }

  const result = await generateGeminiTextCallable({
    prompt,
    model,
    temperature,
    maxOutputTokens,
  });

  return typeof result.data?.text === 'string' ? result.data.text.trim() : '';
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
  signal: _signal,
  temperature = 0.2,
  maxOutputTokens = 512,
}: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}) => {
  void _signal;
  const text = await generateText({ prompt, model, temperature, maxOutputTokens });
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
  signal: _signal,
}: {
  file: File;
  signal?: AbortSignal;
}) => {
  void _signal;
  if (!isGeminiConfigured()) {
    throw new Error('AI proxy not configured');
  }

  const base64Data = await fileToBase64(file);
  const result = await verifyFoodImageCallable({
    mimeType: file.type,
    base64Data,
  });

  return Boolean(result.data?.isFood);
};
