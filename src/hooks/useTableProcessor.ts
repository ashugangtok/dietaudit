
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
      dynamicColumns = [...groupingColNames, ...summaryColNames];
      
      if(summaries.length === 0 && dataToProcess.length > 0 && dataToProcess[0] && groupings.length > 0) {
          const originalCols = Object.keys(dataToProcess[0]);
          const otherCols = originalCols.filter(col => !groupingColNames.includes(col));
          dynamicColumns.push(...otherCols);
      }
      dynamicColumns = [...new Set(dynamicColumns.filter(col => col !== 'note'))];

      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: `Subtotal for ${groupKey}`};
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
                const valueToSet = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
                representativeRow[`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
            });
        } else { // No summaries, just grouping - show first row's data for non-grouping columns
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
    } else if (summaries.length > 0 && dataToProcess.length > 0) { // Only summaries, no groupings (overall summary)
        const summaryRow: DietDataRow = { note: "Overall Summary" };
        dynamicColumns = summaries.map(s => `${s.column}_${s.type}`);
         if(dataToProcess.length > 0 && dataToProcess[0]){
            const originalColKeys = Object.keys(dataToProcess[0]);
            const otherCols = originalColKeys.filter(col => !dynamicColumns.includes(col) && !summaries.find(s=> s.column === col) && col !== 'note');
            dynamicColumns = [...otherCols, ...dynamicColumns];
            otherCols.forEach(col => {
                summaryRow[col] = getColumnValue(dataToProcess[0], col); // Take first row's value for non-summarized, non-grouping cols
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

    // Classic pivot blanking for detail rows (currently not shown with subtotals, but kept for flexibility)
    if (groupings.length > 0 && dataToProcess.length > 0 && !dataToProcess.every(row => !!row.note)) { // Only apply if there are detail rows
      const pivotStyledData = dataToProcess.map((row, rowIndex, arr) => {
        if (row.note) return row; // Skip subtotal rows for blanking
        
        let actualPrevDataRow: DietDataRow | null = null;
        for (let i = rowIndex - 1; i >= 0; i--) {
          if (!arr[i].note) { // Find previous non-note row
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
            // If a parent group already changed, all subsequent (child) group values in this row should be displayed
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
    
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');

    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}
