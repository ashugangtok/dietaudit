
"use client";

import { useMemo, useCallback } from 'react';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { NUMERIC_COLUMNS, DATE_COLUMNS, PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER } from '@/types';

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
      const parsedValue = parseFloat(value as string);
      return isNaN(parsedValue) ? 0 : parsedValue;
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
            if (filterValue === '') return true;
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
      const summaryColNames = summaries.map(s => `${s.column}_${s.type}`);
      
      // Determine initial dynamic columns from groupings and summaries
      // If there are no summaries, include all original columns not already used for grouping.
      if (summaries.length === 0 && dataToProcess.length > 0 && dataToProcess[0] && groupings.length > 0) {
        const originalCols = Object.keys(dataToProcess[0]);
        const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
        dynamicColumns = [...groupingColNames, ...otherCols];
      } else {
        dynamicColumns = [...groupingColNames, ...summaryColNames];
      }
      dynamicColumns = [...new Set(dynamicColumns.filter(col => col !== 'note'))];


      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: PIVOT_SUBTOTAL_MARKER };
        
        groupings.forEach((g, idx) => {
          const groupValue = getColumnValue(groupRows[0], g.column);
          if (idx === 0) { // First grouping column
            representativeRow[g.column] = `Subtotal for ${groupValue}`;
          } else {
            representativeRow[g.column] = groupValue;
          }
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
                const valueToSet = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
                representativeRow[`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
            });
        } else { 
             if (groupRows.length > 0 && groupRows[0]) {
                const originalCols = Object.keys(groupRows[0]);
                // For non-grouping columns that are not the first grouping column (already handled)
                const otherCols = originalCols.filter(col => !groupingColNames.slice(1).includes(col) && col !== groupingColNames[0] && col !== 'note');
                otherCols.forEach(col => {
                    if(!representativeRow[col]) { // Avoid overwriting already set grouping columns
                       representativeRow[col] = getColumnValue(groupRows[0], col);
                    }
                });
             }
        }
        result.push(representativeRow);
      });
      dataToProcess = result;
    } else if (summaries.length > 0 && dataToProcess.length > 0) { 
        const summaryRow: DietDataRow = { note: "Grand Total" }; // Using "Grand Total" as note for overall summary
        dynamicColumns = summaries.map(s => `${s.column}_${s.type}`);
         if(dataToProcess.length > 0 && dataToProcess[0]){
            const originalColKeys = Object.keys(dataToProcess[0]);
            const otherCols = originalColKeys.filter(col => !dynamicColumns.includes(col) && !summaries.find(s=> s.column === col) && col !== 'note');
            
            // For overall summary, the "first column" is usually just the note.
            // If otherCols are needed, they should come *after* potential first column for note.
            if (otherCols.length > 0) {
                 dynamicColumns = [dynamicColumns[0], ...otherCols, ...dynamicColumns.slice(1)]; 
            }
            
            otherCols.forEach(col => {
                summaryRow[col] = getColumnValue(dataToProcess[0], col); 
            });
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
            const valueToSet = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            summaryRow[`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
        });
        dataToProcess = [summaryRow];
         // Ensure the first column (if it's a descriptive one for summary row) is present
        if (!dynamicColumns.includes(Object.keys(summaryRow)[0]) && Object.keys(summaryRow).length > summaries.length +1) { // +1 for note
             const firstKey = Object.keys(summaryRow).find(k => k !== 'note' && !summaries.some(s => `${s.column}_${s.type}` === k));
             if (firstKey) dynamicColumns.unshift(firstKey);
        }
    }
    
    if (groupings.length > 0 && dataToProcess.length > 0 && dataToProcess.some(row => row.note === PIVOT_SUBTOTAL_MARKER)) {
        const groupSortColumns = groupings.map(g => g.column);
        dataToProcess.sort((a, b) => {
            for (const col of groupSortColumns) {
                // For sorting, use original values, not the "Subtotal for X" formatted one for the first column
                const valA = (col === groupSortColumns[0] && a[col]?.toString().startsWith('Subtotal for ')) 
                             ? a[col]?.toString().replace('Subtotal for ', '') 
                             : getColumnValue(a, col);
                const valB = (col === groupSortColumns[0] && b[col]?.toString().startsWith('Subtotal for '))
                             ? b[col]?.toString().replace('Subtotal for ', '')
                             : getColumnValue(b, col);

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

    if (groupings.length > 0 && dataToProcess.length > 0 && !dataToProcess.every(row => !!row.note)) { 
      const pivotStyledData = dataToProcess.map((row, rowIndex, arr) => {
        if (row.note) return row; 
        
        let actualPrevDataRow: DietDataRow | null = null;
        for (let i = rowIndex - 1; i >= 0; i--) {
          if (!arr[i].note) { 
            actualPrevDataRow = arr[i];
            break;
          }
        }
        if (!actualPrevDataRow) return row;

        const newRow = { ...row };
        let parentGroupChanged = false;
        for (const groupCol of groupingColNames) {
          if (newRow[groupCol] === undefined) continue; 
          
          if (parentGroupChanged) {
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
    if (summaries.length > 0 && filteredData.length > 0) {
        grandTotalRow = { note: "Grand Total" }; 
        const firstColKey = dynamicColumns.length > 0 && !summaries.some(s => `${s.column}_${s.type}` === dynamicColumns[0]) ? dynamicColumns[0] : 'note_description';
        if(firstColKey !== 'note_description') grandTotalRow[firstColKey] = 'Grand Total'; else grandTotalRow[firstColKey] = 'Grand Total';


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
            const valueToSet = summary.type === 'average' && typeof totalValue === 'number' ? parseFloat(totalValue.toFixed(2)) : totalValue;
            grandTotalRow![`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
        });
    }
    
    // Final pass for dynamic columns, ensuring 'note' is not included if it was added temporarily
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');
     // If the first column intended for "Grand Total" description isn't in dynamicColumns, add it.
    if (grandTotalRow && grandTotalRow.note === "Grand Total") {
        const firstColForGrandTotal = Object.keys(grandTotalRow).find(k => k !== 'note' && !summaries.some(s => `${s.column}_${s.type}` === k));
        if (firstColForGrandTotal && !dynamicColumns.includes(firstColForGrandTotal)) {
            dynamicColumns.unshift(firstColForGrandTotal);
        }
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}

