import { describe, expect, it } from 'vitest';
import { isRecipeInputValid } from './recipeInput';

describe('isRecipeInputValid', () => {
  it('accepts latin, Hindi, and Marathi ingredient input', () => {
    expect(isRecipeInputValid('rice, dal, onion')).toBe(true);
    expect(isRecipeInputValid('चावल, दाल, पनीर')).toBe(true);
    expect(isRecipeInputValid('भात, डाळ, भाजी')).toBe(true);
  });

  it('rejects empty or symbol-only input', () => {
    expect(isRecipeInputValid('')).toBe(false);
    expect(isRecipeInputValid('  ')).toBe(false);
    expect(isRecipeInputValid(',, !!')).toBe(false);
  });
});
