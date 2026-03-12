export const isRecipeInputValid = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
};
