
"use client";

import { useMemo, useCallback } from 'react';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { NUMERIC_COLUMNS, DATE_COLUMNS, PIVOT_BLANK_MARKER } from '@/types';

interface UseTableProcessorProps {
  rawData: DietDataRow[];
  groupings: GroupingOption[];
  summaries: SummarizationOption[];
  filters: FilterOption[];
}

interface ProcessedTableData {
  processedData: DietDataRow[];
  columns: string[];
  grandTotalRow?: DietDataRow;
}

export function useTableProcessor({
  rawData,
  groupings,
  summaries,
  filters,
}: UseTableProcessorProps): ProcessedTableData {
  const getColumnValue = useCallback((row: DietDataRow, column: string): any => {
    let value = row[column];
     // Check if the column is dynamically created for UOM or is 'Overall Ingredient Total'
    if (NUMERIC_COLUMNS.includes(column as keyof DietDataRow) || 
        summaries.some(s => s.column === 'ingredient_qty' && s.type === 'sum') && (typeof value === 'number' || column === 'Overall Ingredient Total')) {
      const parsedValue = parseFloat(value as string);
      return isNaN(parsedValue) ? 0 : parsedValue;
    }
    if (DATE_COLUMNS.includes(column as keyof DietDataRow)) {
      return value ? new Date(value as string).toLocaleDateString() : '';
    }
    return value;
  }, [summaries]);

  const filteredData = useMemo(() => {
    if (!filters.length) return rawData;
    return rawData.filter(row => {
      return filters.every(filter => {
        const rowValue = getColumnValue(row, filter.column);
        // If a filter is applied to a column that doesn't exist for a row (e.g. dynamic UOM col), treat as no match
        if (rowValue === undefined && Object.keys(row).includes(filter.column) ) {
            // allow blank string checks
        } else if (rowValue === undefined || rowValue === null) {
            return false;
        }


        const filterValue = filter.value;
        const normalizedRowValue = String(rowValue).toLowerCase();
        const normalizedFilterValue = String(filterValue).toLowerCase();


        switch (filter.type) {
          case 'equals':
            return normalizedRowValue === normalizedFilterValue;
          case 'contains':
            if (filterValue === '') return true; // Empty 'contains' filter matches all
            return normalizedRowValue.includes(normalizedFilterValue);
          case 'in':
            return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(normalizedRowValue);
          case 'range_number':
            if (Array.isArray(filterValue) && filterValue.length === 2) {
              const [min, max] = filterValue.map(v => parseFloat(String(v)));
              const numericRowValue = parseFloat(String(rowValue));
              if (isNaN(numericRowValue)) return false;
              const minCheck = isNaN(min) || numericRowValue >= min;
              const maxCheck = isNaN(max) || numericRowValue <= max;
              return minCheck && maxCheck;
            }
            return true;
          default:
            return true;
        }
      });
    });
  }, [rawData, filters, getColumnValue]);

  const processedDataAndColumns = useMemo((): { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    let dataToProcess = [...filteredData];
    let dynamicColumns: string[] = dataToProcess.length > 0 ? Object.keys(dataToProcess[0]) : [];
    const groupingColNames = groupings.map(g => g.column);

    const isPivotingIngredientQty = summaries.find(s => s.column === 'ingredient_qty' && s.type === 'sum');

    if (groupings.length > 0) {
      const grouped = new Map<string, DietDataRow[]>();
      dataToProcess.forEach(row => {
        const groupKey = groupings.map(g => getColumnValue(row, g.column)).join(' | ');
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
        }
        grouped.get(groupKey)!.push(row);
      });

      const result: DietDataRow[] = [];
      let pivotColumnHeaders: string[] = [];

      if (isPivotingIngredientQty) {
        const uniqueUoms = new Set<string>();
        filteredData.forEach(row => {
          if (row.base_uom_name) {
            uniqueUoms.add(String(row.base_uom_name));
          }
        });
        pivotColumnHeaders = Array.from(uniqueUoms).sort();
        dynamicColumns = [...groupingColNames, ...pivotColumnHeaders, 'Overall Ingredient Total'];
      } else {
         // Standard summarization (non-pivot)
        const summaryColNames = summaries.map(s => `${s.column}_${s.type}`);
        dynamicColumns = [...groupingColNames, ...summaryColNames];
        if(summaries.length === 0 && dataToProcess.length > 0 && dataToProcess[0]) {
            const originalCols = Object.keys(dataToProcess[0]);
            const otherCols = originalCols.filter(col => !groupingColNames.includes(col));
            dynamicColumns.push(...otherCols);
        }
      }
      dynamicColumns = [...new Set(dynamicColumns.filter(col => col !== 'note'))];


      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: `Subtotal for ${groupKey}`};
        groupings.forEach(g => {
          representativeRow[g.column] = getColumnValue(groupRows[0], g.column);
        });

        if (isPivotingIngredientQty) {
            let overallIngredientTotalForRow = 0;
            pivotColumnHeaders.forEach(uom => {
                let sumForUom = 0;
                groupRows.forEach(row => {
                    if (String(row.base_uom_name) === uom) {
                        const qty = parseFloat(String(row.ingredient_qty ?? 0));
                        if (!isNaN(qty)) {
                            sumForUom += qty;
                        }
                    }
                });
                representativeRow[uom] = sumForUom > 0 ? parseFloat(sumForUom.toFixed(2)) : 0;
                overallIngredientTotalForRow += sumForUom;
            });
            representativeRow['Overall Ingredient Total'] = overallIngredientTotalForRow > 0 ? parseFloat(overallIngredientTotalForRow.toFixed(2)) : 0;
        } else if (summaries.length > 0) { // Standard summarization
            summaries.forEach(summary => {
                const values = groupRows.map(row => getColumnValue(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                let summaryValue: number | string = 0;
                if (values.length > 0) {
                    switch (summary.type) {
                    case 'sum': summaryValue = values.reduce((acc, val) => acc + val, 0); break;
                    case 'average': summaryValue = values.reduce((acc, val) => acc + val, 0) / values.length; break;
                    case 'count': summaryValue = values.length; break;
                    }
                } else if (summary.type === 'count') {
                    summaryValue = 0;
                } else {
                    summaryValue = 'N/A'; 
                }
                representativeRow[`${summary.column}_${summary.type}`] = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            });
        } else { // No summaries, just grouping
             if (groupRows.length > 0 && groupRows[0]) {
                const originalCols = Object.keys(groupRows[0]);
                const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
                otherCols.forEach(col => {
                    representativeRow[col] = getColumnValue(groupRows[0], col);
                });
             }
        }
        result.push(representativeRow);
      });
      dataToProcess = result;
    } else if (summaries.length > 0 && dataToProcess.length > 0) { // Only summaries, no groupings
        if (isPivotingIngredientQty) {
            const uniqueUoms = new Set<string>();
            filteredData.forEach(row => {
                if (row.base_uom_name) uniqueUoms.add(String(row.base_uom_name));
            });
            pivotColumnHeaders = Array.from(uniqueUoms).sort();
            dynamicColumns = [...pivotColumnHeaders, 'Overall Ingredient Total'];

            const summaryRow: DietDataRow = { note: "Overall Summary" };
            let overallIngredientTotalForTable = 0;
            pivotColumnHeaders.forEach(uom => {
                let sumForUom = 0;
                dataToProcess.forEach(row => {
                    if (String(row.base_uom_name) === uom) {
                        const qty = parseFloat(String(row.ingredient_qty ?? 0));
                        if (!isNaN(qty)) sumForUom += qty;
                    }
                });
                summaryRow[uom] = sumForUom > 0 ? parseFloat(sumForUom.toFixed(2)) : 0;
                overallIngredientTotalForTable += sumForUom;
            });
            summaryRow['Overall Ingredient Total'] = overallIngredientTotalForTable > 0 ? parseFloat(overallIngredientTotalForTable.toFixed(2)) : 0;
            dataToProcess = [summaryRow];
        } else { // Standard overall summary
            const summaryRow: DietDataRow = { note: "Overall Summary" };
            dynamicColumns = summaries.map(s => `${s.column}_${s.type}`);
            if(dataToProcess.length > 0 && dataToProcess[0]){
                const originalColKeys = Object.keys(dataToProcess[0]);
                const otherCols = originalColKeys.filter(col => !dynamicColumns.includes(col) && !summaries.find(s=> s.column === col));
                dynamicColumns = [...otherCols, ...dynamicColumns];
            }
            summaries.forEach(summary => {
                const values = dataToProcess.map(row => getColumnValue(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                let summaryValue: number | string = 0;
                 if (values.length > 0) {
                    switch (summary.type) {
                    case 'sum': summaryValue = values.reduce((acc, val) => acc + val, 0); break;
                    case 'average': summaryValue = values.reduce((acc, val) => acc + val, 0) / values.length; break;
                    case 'count': summaryValue = values.length; break;
                    }
                } else if (summary.type === 'count') {
                    summaryValue = 0;
                } else {
                    summaryValue = 'N/A';
                }
                summaryRow[`${summary.column}_${summary.type}`] = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            });
            dataToProcess = [summaryRow];
        }
    }
    
    if (groupings.length > 0 && dataToProcess.length > 0) {
        const groupSortColumns = groupings.map(g => g.column);
        dataToProcess.sort((a, b) => {
            for (const col of groupSortColumns) {
                const valA = getColumnValue(a, col);
                const valB = getColumnValue(b, col);
                if (valA === undefined || valA === null) return -1;
                if (valB === undefined || valB === null) return 1;
                if (typeof valA === 'string' && typeof valB === 'string') {
                    const comparison = valA.localeCompare(valB);
                    if (comparison !== 0) return comparison;
                } else {
                    if (valA < valB) return -1;
                    if (valA > valB) return 1;
                }
            }
            return 0;
        });
    }

    if (groupings.length > 0 && dataToProcess.length > 0) {
      const pivotStyledData = dataToProcess.map((row, rowIndex, arr) => {
        if (row.note) return row; // Skip subtotal rows
        
        // Find the actual previous data row, skipping any subtotal/note rows
        let actualPrevDataRow: DietDataRow | null = null;
        for (let i = rowIndex - 1; i >= 0; i--) {
          if (!arr[i].note) {
            actualPrevDataRow = arr[i];
            break;
          }
        }

        if (!actualPrevDataRow) return row; // First data row or only subtotal rows before it

        const newRow = { ...row };
        let parentGroupChanged = false;
        for (const groupCol of groupingColNames) {
          if (newRow[groupCol] === undefined) continue; 
          
          if (parentGroupChanged) {
            // If a parent group already changed, all subsequent (child) group values in this row should be displayed
          } else {
            if (getColumnValue(newRow, groupCol) === getColumnValue(actualPrevDataRow, groupCol)) {
              newRow[groupCol] = PIVOT_BLANK_MARKER;
            } else {
              parentGroupChanged = true; // This group value changed, so itself and children should be displayed
            }
          }
        }
        return newRow;
      });
      dataToProcess = pivotStyledData;
    }


    let grandTotalRow: DietDataRow | undefined = undefined;
    if (summaries.length > 0 && filteredData.length > 0) {
        grandTotalRow = { note: "Grand Total" }; 
        if (isPivotingIngredientQty) {
            const uniqueUoms = new Set<string>();
             filteredData.forEach(row => {
                if (row.base_uom_name) uniqueUoms.add(String(row.base_uom_name));
            });
            const allPivotColumnHeaders = Array.from(uniqueUoms).sort(); // Ensure consistent order
            
            let overallGrandTotalSum = 0;
            allPivotColumnHeaders.forEach(uom => {
                let totalForUom = 0;
                filteredData.forEach(row => {
                    if (String(row.base_uom_name) === uom) {
                        const qty = parseFloat(String(row.ingredient_qty ?? 0));
                        if (!isNaN(qty)) {
                            totalForUom += qty;
                        }
                    }
                });
                grandTotalRow![uom] = totalForUom > 0 ? parseFloat(totalForUom.toFixed(2)) : 0;
                overallGrandTotalSum += totalForUom;
            });
            grandTotalRow!['Overall Ingredient Total'] = overallGrandTotalSum > 0 ? parseFloat(overallGrandTotalSum.toFixed(2)) : 0;
        } else { // Standard grand total for non-pivoted summaries
            summaries.forEach(summary => {
                const values = filteredData.map(row => getColumnValue(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                let totalValue: number | string = 0;
                if (values.length > 0) {
                    switch (summary.type) {
                    case 'sum': totalValue = values.reduce((acc, val) => acc + val, 0); break;
                    case 'average': totalValue = values.reduce((acc, val) => acc + val, 0) / values.length; break;
                    case 'count': totalValue = values.length; break;
                    }
                } else if (summary.type === 'count') {
                    totalValue = 0;
                } else {
                    totalValue = 'N/A';
                }
                grandTotalRow![`${summary.column}_${summary.type}`] = summary.type === 'average' && typeof totalValue === 'number' ? parseFloat(totalValue.toFixed(2)) : totalValue;
            });
        }
    }
    
    // Ensure 'note' column is not part of dynamicColumns if it was implicitly added
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}

