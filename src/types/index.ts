
export interface DietDataRow {
  [key: string]: string | number | undefined;
  common_name?: string;
  class_name?: string;
  order_name?: string;
  family_name?: string;
  genus_name?: string;
  user_enclosure_name?: string;
  section_name?: string;
  site_name?: string;
  group_name?: string;
  sex?: string;
  total_animal?: number;
  date?: string; // Or Date object if parsed
  diet_id?: string;
  diet_name?: string;
  diet_no?: string;
  meal_start_time?: string;
  meal_end_time?: string;
  ingredient_name?: string;
  type?: string;
  type_name?: string;
  meal_time?: string;
  preparation_type_name?: string;
  cut_size_name?: string;
  ingredient_qty?: number;
  base_uom_name?: string;
  note?: string; // For subtotals, special notes, or markers
}

export interface GroupingOption {
  column: string;
}

export interface SummarizationOption {
  column: string;
  type: 'sum' | 'average' | 'count';
}

export interface FilterOption {
  column: string;
  value: string | number | string[] | number[]; // Can be single value, array for multi-select, or range
  type: 'equals' | 'contains' | 'in' | 'range_number' | 'range_date';
}

export interface AISuggestions {
  groupingSuggestions: string[];
  summarizationSuggestions: string[];
  filterSuggestions: { column: string; type: string }[];
}

export const EXPECTED_HEADERS: (keyof DietDataRow)[] = [
  "common_name", "class_name", "order_name", "family_name", "genus_name", 
  "user_enclosure_name", "section_name", "site_name", "group_name", "sex", 
  "total_animal", "date", "diet_id", "diet_name", "diet_no", 
  "meal_start_time", "meal_end_time", "ingredient_name", "type", "type_name", 
  "meal_time", "preparation_type_name", "cut_size_name", "ingredient_qty", 
  "base_uom_name"
];

export const NUMERIC_COLUMNS: (keyof DietDataRow)[] = ["total_animal", "ingredient_qty"];
export const DATE_COLUMNS: (keyof DietDataRow)[] = ["date"]; // Assuming 'date' is the primary date column

export const PIVOT_BLANK_MARKER = '__PIVOT_BLANK__';
export const PIVOT_SUBTOTAL_MARKER = '__PIVOT_SUBTOTAL__';

