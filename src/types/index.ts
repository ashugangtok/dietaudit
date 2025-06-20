

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
  total_animal?: number; // Represents original total_animal if present, or count of unique animal_id after processing
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
  actual_animal_count?: number;
  animal_id?: string;
}

export interface GroupingOption {
  column: string;
}

export interface SummarizationOption {
  column: string;
  type: 'sum' | 'average' | 'count' | 'first' | 'max';
}

export interface FilterOption {
  column: string;
  value: string | number | string[] | number[];
  type: 'equals' | 'contains' | 'in' | 'range_number';
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
  "base_uom_name", "actual_animal_count", "animal_id"
];

export const NUMERIC_COLUMNS: (keyof DietDataRow)[] = ["total_animal", "ingredient_qty", "actual_animal_count"];
export const DATE_COLUMNS: (keyof DietDataRow)[] = ["date"];

export const PIVOT_BLANK_MARKER = '__PIVOT_BLANK__';
export const PIVOT_SUBTOTAL_MARKER = '__PIVOT_SUBTOTAL__';


export const SPECIAL_PIVOT_UOM_ROW_GROUPINGS: (keyof DietDataRow)[] = [
  'group_name',
  'common_name',
  'meal_start_time',
  'diet_name',
  'type_name',
  'ingredient_name',
];
export const SPECIAL_PIVOT_UOM_COLUMN_FIELD: keyof DietDataRow = 'base_uom_name';
export const SPECIAL_PIVOT_UOM_VALUE_FIELD: keyof DietDataRow = 'ingredient_qty';


export const DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS: (keyof DietDataRow)[] = [
  'group_name',
  'meal_start_time',
  'diet_name',
  'common_name',
  'type_name',
  'ingredient_name',
];

export const DEFAULT_IMAGE_PIVOT_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'first' },
  { column: 'total_animal', type: 'first' },
  { column: 'base_uom_name', type: 'first' },
];


export const DEFAULT_IMAGE_PIVOT_FILTER_COLUMNS: (keyof DietDataRow)[] = ['class_name'];
export const PIVOT_DEFAULT_FILTERS: (keyof DietDataRow)[] = [];


// Types for Audit Tab hierarchical data
export interface AuditPageIngredient {
  ingredientName: string;
  qtyPerSpecies: number;
  qtyForTotalSpecies: number; // Planned qty for total animals of this species for this ingredient
  uom: string;
  // actualQtyReceived and difference will be stored in auditActualQuantities state
}

export interface AuditPageType {
  typeName: string;
  ingredients: AuditPageIngredient[];
  plannedQtyTypeTotal: number; // Sum of qtyForTotalSpecies for all ingredients in this type
  totalRowsForType: number; // For rowspan calculation
  // actualQtyReceived and difference for the type subtotal will be in auditActualQuantities
}

export interface AuditPageSpeciesDiet {
  speciesName: string;
  animalCount: number;
  types: AuditPageType[];
  totalRowsForSpecies: number; // For rowspan calculation (sum of all ingredient rows + type subtotal rows for this species)
}

export interface AuditPageDietContext {
  mealStartTime: string;
  dietName: string;
  speciesBreakdown: AuditPageSpeciesDiet[];
  speciesSummaryText: string; // e.g., "2 Species: Tufted Capuchin (4), Bearded Capuchin (1)"
  totalRowsInDietContext: number; // For rowspan calculation
}

export interface AuditPageGroup {
  groupName: string;
  dietContexts: AuditPageDietContext[];
  totalRowsForGroup: number; // For rowspan calculation
}

export const AUDIT_TAB_INITIAL_GROUPINGS: GroupingOption[] = [
  { column: 'group_name' },
  { column: 'meal_start_time' },
  { column: 'diet_name' },
  { column: 'common_name' }, // Species
  { column: 'type_name' },   // Mix type
  { column: 'ingredient_name' },
];

export const AUDIT_TAB_INITIAL_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'first' }, // Qty per animal for an ingredient
  { column: 'total_animal', type: 'first' },   // Animal count for the species (already unique by animal_id)
  { column: 'base_uom_name', type: 'first' },  // Unit of measure
];
    
