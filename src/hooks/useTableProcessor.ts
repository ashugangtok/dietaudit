
"use client";

import { useMemo } from 'react';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { NUMERIC_COLUMNS, DATE_COLUMNS, PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER, SPECIAL_PIVOT_UOM_ROW_GROUPINGS, SPECIAL_PIVOT_UOM_COLUMN_FIELD, SPECIAL_PIVOT_UOM_VALUE_FIELD } from '@/types';

interface UseTableProcessorProps {
  rawData: DietDataRow[];
  groupings: GroupingOption[];
  summaries: SummarizationOption[];
  filters: FilterOption[];
  allHeaders: string[];
  hasAppliedFilters: boolean;
}

export interface ProcessedTableData {
  processedData: DietDataRow[];
  columns: string[];
  grandTotalRow?: DietDataRow;
  filteredData: DietDataRow[]; // To know what data was used for processing after filtering
}

// Internal helper to get typed column value
const getColumnValueInternal = (row: DietDataRow, column: string): any => {
    let value = row[column];
    // Attempt to parse if known numeric, otherwise treat as string or keep original type
    if (NUMERIC_COLUMNS.includes(column as keyof DietDataRow)) {
      const parsedValue = parseFloat(value as string);
      // Return parsed number if valid, otherwise return 0 if it was meant to be numeric but unparseable,
      // or empty string if it was genuinely empty/null/undefined (to distinguish from 0).
      return isNaN(parsedValue) ? ( (value === '' || value === undefined || value === null) ? '' : 0 ) : parsedValue;
    }
    if (DATE_COLUMNS.includes(column as keyof DietDataRow)) {
      // Basic date formatting, can be expanded
      return value ? new Date(value as string).toLocaleDateString() : '';
    }
    return value === undefined || value === null ? '' : value; // Ensure consistent empty string for undefined/null
  };


// This function is now also exported for direct use by the Comparison tab's specific logic
export function calculateProcessedTableData(
  rawDataToProcess: DietDataRow[],
  groupingsToApply: GroupingOption[],
  summariesToApply: SummarizationOption[],
  filtersToApply: FilterOption[],
  allHeadersForData: string[], // All headers from the original Excel
  shouldProcessData: boolean, // Typically from hasAppliedFilters
  disableDisplayBlanking: boolean = false // New flag
): ProcessedTableData {

  // 1. Apply Filters
  const internalFilteredDataResult = (() => {
    if (!shouldProcessData || !filtersToApply.length) return rawDataToProcess;
    
    return rawDataToProcess.filter(row => {
      return filtersToApply.every(filter => {
        const rowValue = getColumnValueInternal(row, filter.column); // Get potentially typed value
        
        // Handle empty/null row values specifically
        if (rowValue === '' && filter.type === 'equals' && filter.value === '') return true; // Empty string equals empty string
        if (rowValue === '' && filter.type !== 'equals' ) return false; // Empty string won't contain, be in range, etc. unless filter explicitly targets empty


        const filterValue = filter.value;
        const normalizedRowValue = String(rowValue).toLowerCase();

        switch (filter.type) {
          case 'equals':
            return normalizedRowValue === String(filterValue).toLowerCase();
          case 'contains':
            if (filterValue === '') return true; // Empty contains filter matches all non-empty (or handle as match none)
            return normalizedRowValue.includes(String(filterValue).toLowerCase());
          case 'in': // Assumes filterValue is an array for 'in' type
            return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(normalizedRowValue);
          case 'range_number': // Assumes filterValue is [min, max] for 'range_number'
            if (Array.isArray(filterValue) && filterValue.length === 2) {
              const [min, max] = filterValue.map(v => parseFloat(String(v))); // Ensure parsing
              const numericRowValue = parseFloat(String(rowValue)); // Ensure row value is also parsed
              if (isNaN(numericRowValue)) return false; // Non-numeric row value can't be in range
              const minCheck = isNaN(min) || numericRowValue >= min;
              const maxCheck = isNaN(max) || numericRowValue <= max;
              return minCheck && maxCheck;
            }
            return true; // Malformed range filter, defaults to true
          default:
            return true;
        }
      });
    });
  })();

  // 2. Determine if Special UoM Pivot Mode is Active
  const isSpecialPivotModeActive = (() => {
    if (!shouldProcessData) return false;

    // Check if summaries and groupings match the special UoM pivot criteria
    if (summariesToApply.length === 1 && summariesToApply[0].column === SPECIAL_PIVOT_UOM_VALUE_FIELD && summariesToApply[0].type === 'sum') {
      const currentGroupingCols = groupingsToApply.map(g => g.column);
      const allExpectedGroupingsPresent = SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => currentGroupingCols.includes(col as string));
      const correctNumberOfGroupings = currentGroupingCols.length === SPECIAL_PIVOT_UOM_ROW_GROUPINGS.length; // Exact match

      return allExpectedGroupingsPresent &&
             correctNumberOfGroupings &&
             allHeadersForData.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD) &&
             allHeadersForData.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD);
    }
    return false;
  })();

  // 3. Process Data (Grouping, Summarization, Pivoting)
  const processedDataAndColumnsResult = ((): { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    if (!shouldProcessData || (rawDataToProcess.length === 0 && allHeadersForData.length === 0)) {
      // If no processing needed or no data/headers, return empty or raw structure
      return { data: [], dynamicColumns: allHeadersForData.length > 0 ? allHeadersForData : [], grandTotalRow: undefined };
    }
    
    let dataToProcess: DietDataRow[] = [...internalFilteredDataResult]; // Start with filtered data
    let dynamicColumns: string[] = [];
    if (dataToProcess.length > 0 && dataToProcess[0]) {
        dynamicColumns = Object.keys(dataToProcess[0]); // Initial columns from data
    } else if (allHeadersForData.length > 0) {
        dynamicColumns = allHeadersForData; // Fallback to all headers if no data rows
    }


    let grandTotalRow: DietDataRow | undefined = undefined;
    let baseUomNameFirstSummaryKey = ''; // To track the name of the 'base_uom_name_first' summary column

    if (isSpecialPivotModeActive) {
      // --- Special UoM Pivot Logic ---
      const rowKeyColumns = SPECIAL_PIVOT_UOM_ROW_GROUPINGS as string[];
      const pivotColName = SPECIAL_PIVOT_UOM_COLUMN_FIELD;
      const valueColName = SPECIAL_PIVOT_UOM_VALUE_FIELD;

      const uniquePivotColumnValues = [...new Set(internalFilteredDataResult.map(row => String(row[pivotColName] || 'Unknown')).filter(val => val.trim() !== ''))].sort();
      dynamicColumns = [...rowKeyColumns, ...uniquePivotColumnValues]; // Final columns for the pivoted table
      const pivotedDataMap = new Map<string, DietDataRow>();

      for (const row of internalFilteredDataResult) {
        const keyParts = rowKeyColumns.map(col => String(row[col] || '')); // Use empty string for undefined/null group keys
        const mapKey = keyParts.join('||');

        if (!pivotedDataMap.has(mapKey)) {
          const baseRow: DietDataRow = {};
          rowKeyColumns.forEach((col, index) => {
            baseRow[col] = keyParts[index];
          });
          uniquePivotColumnValues.forEach(pivotVal => {
            baseRow[pivotVal] = undefined; // Initialize pivot columns to allow sum
          });
          pivotedDataMap.set(mapKey, baseRow);
        }

        const mapEntry = pivotedDataMap.get(mapKey)!;
        const currentPivotActualValue = String(row[pivotColName] || 'Unknown');
        const qty = parseFloat(String(row[valueColName] || '0'));

        if (!isNaN(qty) && currentPivotActualValue.trim() !== '') {
          const existingQty = parseFloat(String(mapEntry[currentPivotActualValue] || '0'));
          mapEntry[currentPivotActualValue] = (isNaN(existingQty) ? 0 : existingQty) + qty;
        }
      }
      dataToProcess = Array.from(pivotedDataMap.values());
      // Round numeric pivot values
      dataToProcess.forEach(pivotedRow => {
        uniquePivotColumnValues.forEach(pivotCol => {
          if (typeof pivotedRow[pivotCol] === 'number') {
            pivotedRow[pivotCol] = parseFloat((pivotedRow[pivotCol] as number).toFixed(2)); // Max 2 decimal places for pivoted values
          } else if (pivotedRow[pivotCol] === undefined) {
             pivotedRow[pivotCol] = ''; // Ensure undefined becomes blank for display
          }
        });
      });
      // Sort pivoted data
      dataToProcess.sort((a, b) => {
        for (const col of rowKeyColumns) {
          const valA = String(a[col] || '').toLowerCase();
          const valB = String(b[col] || '').toLowerCase();
          if (valA < valB) return -1;
          if (valA > valB) return 1;
        }
        return 0;
      });
      
      if (!disableDisplayBlanking) { // Apply blanking only if not disabled
        let lastRowKeyValues: (string | number | undefined)[] = [];
        dataToProcess = dataToProcess.map((row, rowIndex) => {
          if (rowIndex === 0) {
            lastRowKeyValues = rowKeyColumns.map(col => row[col]);
            return row;
          }
          const currentRowKeyValues = rowKeyColumns.map(col => row[col]);
          const newRow = { ...row };
          let sameAsLast = true;
          for (let i = 0; i < rowKeyColumns.length; i++) {
            if (sameAsLast && currentRowKeyValues[i] === lastRowKeyValues[i]) {
              newRow[rowKeyColumns[i]] = PIVOT_BLANK_MARKER;
            } else {
              sameAsLast = false;
            }
          }
          lastRowKeyValues = currentRowKeyValues;
          return newRow;
        });
      }

      // Grand total for special pivot
      if (dataToProcess.length > 0) {
        grandTotalRow = { note: "Grand Total" };
        if (rowKeyColumns.length > 0) {
          grandTotalRow[rowKeyColumns[0]] = "Grand Total";
          for (let i = 1; i < rowKeyColumns.length; i++) {
            grandTotalRow[rowKeyColumns[i]] = PIVOT_BLANK_MARKER; // Blank out other grouping cols for GT
          }
        }
        uniquePivotColumnValues.forEach(pivotColValue => {
          const total = internalFilteredDataResult.reduce((sum, currentRow) => {
            if (String(currentRow[pivotColName] || 'Unknown') === pivotColValue) { // Ensure comparison with string form
                const val = parseFloat(String(currentRow[valueColName] || '0'));
                return sum + (isNaN(val) ? 0 : val);
            }
            return sum;
          }, 0);
          grandTotalRow![pivotColValue] = parseFloat(total.toFixed(2)); // Max 2 decimal places for GT
        });
      }
    } else { // --- Standard Grouping and Summarization Logic (View Data, Export Sections, base for Comparison) ---
        const groupingColNames = groupingsToApply.map(g => g.column);
        const summaryColDetails = summariesToApply.map(s => ({
            name: `${s.column}_${s.type}`, // e.g., ingredient_qty_sum
            originalColumn: s.column,
            type: s.type,
        }));
        
        baseUomNameFirstSummaryKey = summaryColDetails.find(s => s.originalColumn === 'base_uom_name' && s.type === 'first')?.name || '';
        
        dynamicColumns = [...groupingColNames, ...summaryColDetails.map(s => s.name)];

        if (groupingColNames.length > 0 && internalFilteredDataResult.length > 0) {
            const grouped = new Map<string, DietDataRow[]>();
            internalFilteredDataResult.forEach(row => {
                const groupKey = groupingColNames.map(gCol => getColumnValueInternal(row, gCol)).join('||');
                if (!grouped.has(groupKey)) grouped.set(groupKey, []);
                grouped.get(groupKey)!.push(row);
            });

            const result: DietDataRow[] = [];
            
            // For diet_name species list and common_name animal count formatting (only if !disableDisplayBlanking)
            const speciesPerDietContext = new Map<string, Set<string>>();
            const dietNameColumnKey = 'diet_name';
            const commonNameColumnKey = 'common_name';
            const dietNameGroupIndex = groupingColNames.indexOf(dietNameColumnKey);

            if (!disableDisplayBlanking && dietNameGroupIndex !== -1 && allHeadersForData.includes(commonNameColumnKey)) {
                internalFilteredDataResult.forEach(rawRow => {
                    let contextKey = '';
                    // Build context key up to and including diet_name
                    for (let i = 0; i <= dietNameGroupIndex; i++) {
                        contextKey += (getColumnValueInternal(rawRow, groupingColNames[i]) || '') + '||';
                    }
                    const speciesName = getColumnValueInternal(rawRow, commonNameColumnKey);
                    if (typeof speciesName === 'string' && speciesName.trim() !== '') {
                        if (!speciesPerDietContext.has(contextKey)) {
                            speciesPerDietContext.set(contextKey, new Set());
                        }
                        speciesPerDietContext.get(contextKey)!.add(speciesName.trim());
                    }
                });
            }
            
            grouped.forEach((groupRows) => {
                const representativeRow: DietDataRow = {};
                const firstRowInGroup = groupRows[0];

                // Populate grouping columns
                groupingColNames.forEach(gCol => {
                    representativeRow[gCol] = getColumnValueInternal(firstRowInGroup, gCol);
                });

                // Populate summary columns
                summaryColDetails.forEach(summary => {
                    const values = groupRows.map(row => getColumnValueInternal(row, summary.originalColumn));
                    let summaryValue: string | number = '';
                    const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v)); // Filter out NaN before processing

                    if (numericValues.length > 0) {
                        switch (summary.type) {
                            case 'sum': summaryValue = numericValues.reduce((acc, val) => acc + val, 0); break;
                            case 'average': summaryValue = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length; break;
                            case 'count': summaryValue = numericValues.length; break; // Count of numeric values
                            case 'first': summaryValue = numericValues[0]; break; // First numeric value
                            case 'max': summaryValue = Math.max(...numericValues); break;
                            default: summaryValue = ''; // Should not happen with defined types
                        }
                         // Round sum/average to a reasonable number of decimal places
                         if (typeof summaryValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                            summaryValue = parseFloat(summaryValue.toFixed(4)); // Max 4 decimal places for sum/avg
                        }
                    } else if (summary.type === 'count') { // If no numeric values, count is 0
                        summaryValue = 0; 
                    } else { // For sum, average, max with no numeric values, or for 'first' with non-numeric
                        const firstNonEmptyStringValue = values.find(v => v !== '' && v !== undefined && v !== null);
                        if (summary.type === 'first') {
                            summaryValue = firstNonEmptyStringValue !== undefined ? String(firstNonEmptyStringValue) : '';
                        } else {
                            summaryValue = ''; // For sum/avg/max if no numeric values, default to empty or handle as error
                        }
                    }
                    representativeRow[summary.name] = summaryValue;
                });
                
                // --- Formatting for display (if not disabled) ---
                if (!disableDisplayBlanking) {
                    // Format diet_name with species list
                    if (dietNameGroupIndex !== -1 && allHeadersForData.includes(commonNameColumnKey)) {
                        let representativeDietContextKey = '';
                        for (let i = 0; i <= dietNameGroupIndex; i++) {
                            representativeDietContextKey += (representativeRow[groupingColNames[i]] || '') + '||';
                        }
                        const speciesSet = speciesPerDietContext.get(representativeDietContextKey);
                        if (speciesSet && speciesSet.size > 0) {
                            const originalDietNameValue = representativeRow[dietNameColumnKey]; // Original value before modification
                            if (originalDietNameValue !== undefined && 
                                originalDietNameValue !== PIVOT_BLANK_MARKER && 
                                String(originalDietNameValue).trim() !== '') { // Check if it's a real diet name
                                const speciesCount = speciesSet.size;
                                const speciesList = Array.from(speciesSet).sort().join(', '); // Comma separated for conciseness
                                representativeRow[dietNameColumnKey] = `${String(originalDietNameValue).trim()} (${speciesCount} Species: ${speciesList})`;
                            }
                        }
                    }

                    // Format common_name with animal count
                    if (groupingColNames.includes(commonNameColumnKey)) {
                        const originalCommonNameInRow = representativeRow[commonNameColumnKey]; // Original common_name before modification
                        const totalAnimalSummaryKey = summaryColDetails.find(s => s.originalColumn === 'total_animal' && (s.type === 'first' || s.type === 'sum' || s.type === 'max'))?.name;
                        let totalAnimalCountForDisplay: number | string | undefined = undefined;

                        if (totalAnimalSummaryKey && representativeRow[totalAnimalSummaryKey] !== undefined) {
                            totalAnimalCountForDisplay = representativeRow[totalAnimalSummaryKey];
                        }
                        
                        // Append count only if common_name is a real value and not already formatted
                        if (originalCommonNameInRow !== undefined && 
                            originalCommonNameInRow !== PIVOT_BLANK_MARKER && 
                            String(originalCommonNameInRow).trim() !== '' &&
                            !String(originalCommonNameInRow).includes(' Species:') && // Avoid double annotation from diet_name
                            totalAnimalCountForDisplay !== undefined && 
                            String(totalAnimalCountForDisplay).trim() !== '') {
                            const numericTotalAnimal = typeof totalAnimalCountForDisplay === 'string' 
                                                        ? parseFloat(totalAnimalCountForDisplay) 
                                                        : totalAnimalCountForDisplay;
                            if (typeof numericTotalAnimal === 'number' && !isNaN(numericTotalAnimal)) {
                                 representativeRow[commonNameColumnKey] = `${String(originalCommonNameInRow).trim()} (${numericTotalAnimal})`;
                            }
                        }
                    }
                }
                result.push(representativeRow);
            });
            
            dataToProcess = result;

            // Sort processed data based on grouping columns
            dataToProcess.sort((a, b) => { // Ensure consistent sorting
                for (const col of groupingColNames) {
                    // Get raw values for sorting, before any blanking for display
                    const valA = getColumnValueInternal(a, col);
                    const valB = getColumnValueInternal(b, col);
                    // Skip comparison if one of the values is a blank marker (as it means it's part of same group as above)
                    if (valA === PIVOT_BLANK_MARKER || valB === PIVOT_BLANK_MARKER) continue;
                    
                    const strA = String(valA).toLowerCase();
                    const strB = String(valB).toLowerCase();

                    if (strA < strB) return -1;
                    if (strA > strB) return 1;
                }
                return 0;
            });

            // Apply blanking for display if not disabled and groupings exist
            if (!disableDisplayBlanking && groupingColNames.length > 0) { 
                let lastActualKeyValues: (string | number | undefined)[] = new Array(groupingColNames.length).fill(undefined);
                const tempProcessedDataForBlanking = [...dataToProcess]; // Operate on a copy for blanking pass
                dataToProcess = tempProcessedDataForBlanking.map((row, rowIndex) => {
                    const newRow = { ...row }; // Create a new object for the potentially modified row
                    if (rowIndex === 0) {
                        // For the first row, all grouping values are actuals
                        groupingColNames.forEach((gCol, i) => {
                            lastActualKeyValues[i] = newRow[gCol]; // Store its actual value
                        });
                        return newRow;
                    }

                    // For subsequent rows, compare with last *actual* values
                    let baseGroupChanged = false; // Flag to track if a higher-level group changed
                    for (let i = 0; i < groupingColNames.length; i++) {
                        const gCol = groupingColNames[i];
                        const currentValue = newRow[gCol]; // Current actual value from processed data
                        
                        if (baseGroupChanged) { 
                            // If a higher-level group already changed, this and subsequent levels are new actuals
                            lastActualKeyValues[i] = currentValue;
                            continue; // Don't blank it
                        }

                        // Only blank if current value matches last *actual* (non-blanked) value
                        // AND it's not the ingredient_name column (we always want to show ingredient name)
                        if (currentValue === lastActualKeyValues[i] && gCol !== 'ingredient_name') { 
                            newRow[gCol] = PIVOT_BLANK_MARKER;
                        } else {
                            // Value is different from last actual, or it's ingredient_name
                            lastActualKeyValues[i] = currentValue; // Update last actual value
                            baseGroupChanged = true; // Mark that this level (and thus sub-levels) is new
                        }
                    }
                    return newRow;
                });
            }
        } else if (summariesToApply.length > 0 && internalFilteredDataResult.length > 0) { // Only summaries, no groupings
            // Create a single summary row
            const summaryRow: DietDataRow = { note: "Overall Summary" }; // Add a note for clarity
            summaryColDetails.forEach(summary => {
                const values = internalFilteredDataResult.map(row => getColumnValueInternal(row, summary.originalColumn));
                let summaryValue: string | number = '';
                 const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v));
                 if (numericValues.length > 0) {
                     switch (summary.type) {
                         case 'sum': summaryValue = numericValues.reduce((acc, val) => acc + val, 0); break;
                         case 'average': summaryValue = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length; break;
                         case 'count': summaryValue = numericValues.length; break;
                         case 'first': summaryValue = numericValues[0]; break;
                         case 'max': summaryValue = Math.max(...numericValues); break;
                     }
                     if (typeof summaryValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                        summaryValue = parseFloat(summaryValue.toFixed(4));
                     }
                 } else if (summary.type === 'count') {
                     summaryValue = 0;
                 } else {
                    const firstNonEmpty = values.find(v => v !== '' && v !== undefined && v !== null);
                    summaryValue = summary.type === 'first' ? (firstNonEmpty !== undefined ? String(firstNonEmpty) : '') : '';
                 }
                summaryRow[summary.name] = summaryValue;
            });
            
            // Add a label for the summary row if dynamicColumns are determined
            if (dynamicColumns.length > 0 && !summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                summaryRow[dynamicColumns[0]] = "Overall Summary";
            } else if (dynamicColumns.length > 0 && summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                // If the first dynamic column IS a summary column, try to make a more descriptive label
                const firstOriginalCol = summaryColDetails.find(s => s.name === dynamicColumns[0])?.originalColumn || dynamicColumns[0];
                summaryRow[dynamicColumns[0]] = `Overall ${firstOriginalCol.replace(/_/g, ' ')}`;
            } else if (allHeadersForData.length > 0) { // Fallback if no dynamic columns yet determined
                summaryRow[allHeadersForData[0]] = "Overall Summary"; 
            }
            dataToProcess = [summaryRow];
            dynamicColumns = summaryColDetails.map(s => s.name); // Columns are just the summary names
        } else { // No groupings and no summaries, or no data to process
          dataToProcess = internalFilteredDataResult; // Show filtered raw data
          // Ensure dynamicColumns are set from allHeaders if dataToProcess is empty but headers exist
          if (internalFilteredDataResult.length === 0 && allHeadersForData.length > 0) {
            dynamicColumns = allHeadersForData; 
          }
        }

        // Grand Total Row Calculation (common for standard processing)
        if (summariesToApply.length > 0 && internalFilteredDataResult.length > 0) {
            grandTotalRow = { note: "Grand Total" };
            if (groupingColNames.length > 0) {
                // Set first grouping column to "Grand Total", others to blank marker
                grandTotalRow[groupingColNames[0]] = "Grand Total";
                for (let i = 1; i < groupingColNames.length; i++) {
                    grandTotalRow[groupingColNames[i]] = PIVOT_BLANK_MARKER;
                }
            } else if (dynamicColumns.length > 0 && !summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                // If no groupings, but dynamic columns exist (e.g. from raw data display), put GT label in first
                grandTotalRow[dynamicColumns[0]] = "Grand Total";
            }

            summaryColDetails.forEach(summary => {
                const values = internalFilteredDataResult.map(row => getColumnValueInternal(row, summary.originalColumn));
                let totalValue: string | number = '';
                const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v));
                 if (numericValues.length > 0) {
                     switch (summary.type) {
                         case 'sum': totalValue = numericValues.reduce((acc, val) => acc + val, 0); break;
                         case 'average': totalValue = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length; break; // Avg of all filtered items
                         case 'count': totalValue = numericValues.length; break;
                         case 'first': totalValue = values.find(v => v !== '' && v !== undefined && v !== null && String(v).trim() !== '') || ''; break; // True first from filtered set
                         case 'max': totalValue = Math.max(...numericValues); break;
                     }
                      if (typeof totalValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                        totalValue = parseFloat(totalValue.toFixed(4));
                     }
                 } else if (summary.type === 'count') {
                     totalValue = 0;
                 } else { // For sum, avg, max with no numeric values, or for 'first' non-numeric
                    const firstNonEmpty = values.find(v => v !== '' && v !== undefined && v !== null && String(v).trim() !== '');
                    totalValue = summary.type === 'first' ? (firstNonEmpty !== undefined ? String(firstNonEmpty) : '') : '';
                 }
                grandTotalRow![summary.name] = totalValue; // Assign to the summary name key, e.g., 'ingredient_qty_sum'
            });

            // If no groupings and only summaries, adjust the grand total label for the first summary column
            if (groupingColNames.length === 0 && summaryColDetails.length > 0 && grandTotalRow) {
                const firstSummaryColName = summaryColDetails[0].name;
                const originalGrandTotalValue = grandTotalRow[firstSummaryColName];
                const summaryColForGT = summaryColDetails.find(s => s.name === firstSummaryColName)?.originalColumn.replace(/_/g, ' ') || firstSummaryColName;

                if (originalGrandTotalValue !== undefined && String(originalGrandTotalValue).trim() !== '' && 
                    !(typeof originalGrandTotalValue === 'string' && originalGrandTotalValue.includes(summaryColForGT)) // Avoid double labeling
                ) {
                     grandTotalRow[firstSummaryColName] = `Grand Total (${summaryColForGT}: ${originalGrandTotalValue})`;
                } else if (grandTotalRow[firstSummaryColName] !== `Grand Total (${summaryColForGT})`) { // Ensure label if value was empty
                     grandTotalRow[firstSummaryColName] = `Grand Total (${summaryColForGT})`;
                }
            }
        }
    } 
    
    // Final cleanup of dynamicColumns: remove 'note' and potentially 'base_uom_name_first' 
    // if it's not part of special pivot and blanking is not disabled (UoM display handled in DataTable)
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');
    if (baseUomNameFirstSummaryKey && !isSpecialPivotModeActive && !disableDisplayBlanking) { 
        // Logic for potentially removing baseUomNameFirstSummaryKey if UoM is concatenated in DataTable
        // This is tricky: DataTable needs this column to concatenate. So, we usually keep it here
        // and let DataTable decide whether to render it as a separate column or not.
        // For now, no change here, DataTable's effectiveDisplayColumns handles it.
    }
    
    // Ensure "Grand Total" label is consistently in the first displayable column for GT row if not already set by specific logic
    if (grandTotalRow && !Object.keys(grandTotalRow).some(k => k !== 'note' && String(grandTotalRow[k]).toLowerCase().includes("grand total"))) {
        const firstColForGTDisplay = dynamicColumns.length > 0 ? dynamicColumns[0] : 
                              (groupingsToApply.map(g=>g.column).length > 0 ? groupingsToApply.map(g=>g.column)[0] : 
                              (summariesToApply.map(s=>`${s.column}_${s.type}`).length > 0 ? summariesToApply.map(s=>`${s.column}_${s.type}`)[0] : undefined));
        
        if (firstColForGTDisplay && grandTotalRow[firstColForGTDisplay] !== PIVOT_BLANK_MARKER) { // Don't overwrite if it's meant to be blank
             const gtValue = grandTotalRow[firstColForGTDisplay];
             if (!String(gtValue).toLowerCase().startsWith("grand total")) { // Avoid double "Grand Total"
                grandTotalRow[firstColForGTDisplay] = 'Grand Total' + ((gtValue !== undefined && gtValue !== PIVOT_BLANK_MARKER && String(gtValue).trim() !== '') ? ` (${gtValue})` : '');
             }
        } else if (firstColForGTDisplay && grandTotalRow[firstColForGTDisplay] === PIVOT_BLANK_MARKER && groupingsToApply.map(g=>g.column).length === 0) {
             // If first column is blank marker AND there are no groupings (i.e. summary-only view), still put "Grand Total"
             grandTotalRow[firstColForGTDisplay] = "Grand Total";
        }
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  })();

  return {
    processedData: processedDataAndColumnsResult.data,
    columns: processedDataAndColumnsResult.dynamicColumns,
    grandTotalRow: processedDataAndColumnsResult.grandTotalRow,
    filteredData: internalFilteredDataResult, // Return the data after filtering but before grouping/summarizing
  };
}


// Main hook used by page.tsx for "View Data" and "Export Sections"
export function useTableProcessor({
  rawData,
  groupings,
  summaries,
  filters,
  allHeaders,
  hasAppliedFilters,
}: UseTableProcessorProps): ProcessedTableData {
    return useMemo(() => {
        // For default views, disableDisplayBlanking is false (default), enabling standard display formatting.
        return calculateProcessedTableData(rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters, false);
    }, [rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters]);
}

    
