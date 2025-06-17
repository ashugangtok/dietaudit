
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
    if (NUMERIC_COLUMNS.includes(column as keyof DietDataRow)) {
      value = parseFloat(value as string);
      return isNaN(value) ? 0 : value;
    }
    if (DATE_COLUMNS.includes(column as keyof DietDataRow)) {
      return value ? new Date(value as string).toLocaleDateString() : '';
    }
    return value;
  }, []);

  const filteredData = useMemo(() => {
    if (!filters.length) return rawData;
    return rawData.filter(row => {
      return filters.every(filter => {
        const rowValue = getColumnValue(row, filter.column);
        if (rowValue === undefined || rowValue === null) return false;

        const filterValue = filter.value;

        switch (filter.type) {
          case 'equals':
            return String(rowValue).toLowerCase() === String(filterValue).toLowerCase();
          case 'contains':
            return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
          case 'in':
            return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(String(rowValue).toLowerCase());
          case 'range_number':
            if (Array.isArray(filterValue) && filterValue.length === 2) {
              const [min, max] = filterValue;
              const numericRowValue = parseFloat(String(rowValue));
              if (isNaN(numericRowValue)) return false;
              return numericRowValue >= (min ?? -Infinity) && numericRowValue <= (max ?? Infinity);
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
    let dynamicColumns = dataToProcess.length > 0 ? Object.keys(dataToProcess[0]) : [];

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
      const groupingColNames = groupings.map(g => g.column);
      dynamicColumns = [...groupingColNames, ...summaries.map(s => `${s.column}_${s.type}`)];
      
      if(summaries.length === 0 && dataToProcess.length > 0 && dataToProcess[0]) {
        const originalCols = Object.keys(dataToProcess[0]);
        const otherCols = originalCols.filter(col => !groupingColNames.includes(col));
        dynamicColumns.push(...otherCols);
      }


      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: `Subtotal for ${groupKey}`}; // Add note for subtotal
        groupings.forEach(g => {
          representativeRow[g.column] = getColumnValue(groupRows[0], g.column);
        });

        if (summaries.length > 0) {
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
        } else {
             if (groupRows.length > 0 && groupRows[0]) {
                const originalCols = Object.keys(groupRows[0]);
                const otherCols = originalCols.filter(col => !groupingColNames.includes(col));
                otherCols.forEach(col => {
                    representativeRow[col] = getColumnValue(groupRows[0], col);
                });
             }
        }
        result.push(representativeRow);
        // Add individual rows after subtotal if no summaries or if detail is needed
        // For classic pivot, we usually show aggregated data. If detail needed, that's different.
        // The image shows detail (ingredient_name), so 'ingredient_name' must be a group.
      });
      dataToProcess = result; // This is the aggregated data with subtotals
      
      // Ensure dynamicColumns is unique and preserves order
      dynamicColumns = [...new Set(dynamicColumns.filter(col => col !== 'note'))];


    } else if (summaries.length > 0 && dataToProcess.length > 0) {
        // Only summaries, no groupings. Calculate summaries for all data.
        const summaryRow: DietDataRow = { note: "Overall Summary" };
         dynamicColumns = summaries.map(s => `${s.column}_${s.type}`);
         if(dataToProcess.length > 0 && dataToProcess[0]){
            const otherCols = Object.keys(dataToProcess[0]).filter(col => !dynamicColumns.includes(col) && !summaries.find(s=> s.column === col));
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
        // dataToProcess = [summaryRow]; // This would replace data with just summary. Not desired for pivot.
    }
    
    // Sorting for pivot view if groupings are present
    if (groupings.length > 0 && dataToProcess.length > 0) {
        const groupSortColumns = groupings.map(g => g.column);
        dataToProcess.sort((a, b) => {
            for (const col of groupSortColumns) {
                const valA = getColumnValue(a, col);
                const valB = getColumnValue(b, col);
                // Handle undefined or null for sorting robustly
                if (valA === undefined || valA === null) return -1;
                if (valB === undefined || valB === null) return 1;
                if (valA < valB) return -1;
                if (valA > valB) return 1;
            }
            return 0;
        });
    }

    // Apply pivot blanking logic
    if (groupings.length > 0 && dataToProcess.length > 0) {
      const groupingColNames = groupings.map(g => g.column);
      const pivotStyledData = dataToProcess.map((row, rowIndex, arr) => {
        if (row.note) return row; // Skip pivot blanking for subtotal/note rows

        // Find the true previous data row, skipping any note/subtotal rows
        let actualPrevDataRow: DietDataRow | null = null;
        for (let i = rowIndex - 1; i >= 0; i--) {
          if (!arr[i].note) {
            actualPrevDataRow = arr[i];
            break;
          }
        }
        if (!actualPrevDataRow) return row; // No previous data row, so display fully

        const newRow = { ...row };
        let parentGroupChanged = false;
        for (const groupCol of groupingColNames) {
          if (newRow[groupCol] === undefined) continue; 

          if (parentGroupChanged) {
            // Parent changed, so this current groupCol and subsequent ones should be displayed
          } else {
            if (getColumnValue(newRow, groupCol) === getColumnValue(actualPrevDataRow, groupCol)) {
              newRow[groupCol] = PIVOT_BLANK_MARKER;
            } else {
              parentGroupChanged = true; 
            }
          }
        }
        return newRow;
      });
      dataToProcess = pivotStyledData;
    }


    let grandTotalRow: DietDataRow | undefined = undefined;
    if (summaries.length > 0 && filteredData.length > 0) { // Use filteredData for accurate grand totals
        grandTotalRow = { note: "Grand Total" }; 
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
    
    // Ensure 'note' is not in dynamicColumns if it was implicitly added
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');
    if (dataToProcess.length > 0 && dataToProcess[0] && Object.keys(dataToProcess[0]).includes('note')) {
        // If 'note' column exists due to subtotals, ensure it's handled or explicitly added if needed as a display column.
        // For now, assume 'note' is not a regular display column unless it's the first grouping column for subtotal text.
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}
