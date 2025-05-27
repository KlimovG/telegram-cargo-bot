export interface AddCalculationParams {
  type: string;
  weight: number;
  volume: number;
  price: number;
}

export interface FieldDictionaryEntry {
  key: string;
  header: string;
  unit?: string;
  hint?: string;
}

export type FieldDictionary = Record<string, FieldDictionaryEntry>; 