"use client";

import { useMemo, useCallback } from 'react';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { NUMERIC_COLUMNS, DATE_COLUMNS } from '@/types';

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
      // Basic date handling, can be expanded with date-fns if complex parsing/formatting is needed
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
          // Add 'range_date' case if needed
          default:
            return true;
        }
      });
    });
  }, [rawData, filters, getColumnValue]);

  const processedDataAndColumns = useMemo(() : { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    if (!groupings.length && !summaries.length) {
      const dynamicColumns = filteredData.length > 0 ? Object.keys(filteredData[0]) : [];
      return { data: filteredData, dynamicColumns };
    }

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
      dynamicColumns = [...groupings.map(g => g.column), ...summaries.map(s => `${s.column}_${s.type}`)];
      
      // Keep other non-summarized, non-grouped columns if no summaries, or if needed
      if(summaries.length === 0 && dataToProcess.length > 0) {
        const originalCols = Object.keys(dataToProcess[0]);
        const otherCols = originalCols.filter(col => !groupings.find(g => g.column === col));
        dynamicColumns.push(...otherCols);
      }


      grouped.forEach((groupRows) => {
        const representativeRow: DietDataRow = {};
        groupings.forEach(g => {
          representativeRow[g.column] = getColumnValue(groupRows[0], g.column);
        });

        if (summaries.length > 0) {
            summaries.forEach(summary => {
                const values = groupRows.map(row => getColumnValue(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                let summaryValue: number | string = 0;
                if (values.length > 0) {
                    switch (summary.type) {
                    case 'sum':
                        summaryValue = values.reduce((acc, val) => acc + val, 0);
                        break;
                    case 'average':
                        summaryValue = values.reduce((acc, val) => acc + val, 0) / values.length;
                        break;
                    case 'count':
                        summaryValue = values.length;
                        break;
                    }
                } else if (summary.type === 'count') {
                    summaryValue = 0;
                } else {
                    summaryValue = 'N/A'; // Or 0, or handle as needed
                }
                representativeRow[`${summary.column}_${summary.type}`] = summary.type === 'average' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            });
        } else {
            // If no summaries, just take the first row for non-grouped columns or average them etc.
            // For simplicity, this example just takes the first row's values for other columns.
            // A more complex scenario might average numbers or list unique strings.
             if (groupRows.length > 0) {
                const originalCols = Object.keys(groupRows[0]);
                const otherCols = originalCols.filter(col => !groupings.find(g => g.column === col));
                otherCols.forEach(col => {
                    representativeRow[col] = getColumnValue(groupRows[0], col);
                });
             }
        }
        result.push(representativeRow);
      });
      dataToProcess = result;
    }
    
    // Grand Total Row Calculation
    let grandTotalRow: DietDataRow | undefined = undefined;
    if (summaries.length > 0 && dataToProcess.length > 0) {
        grandTotalRow = { note: "Grand Total" }; // Special key for identifying this row
        // Initialize summary columns for grand total
        summaries.forEach(summary => {
            grandTotalRow![`${summary.column}_${summary.type}`] = 0;
        });
        
        // Use filteredData for grand total to sum up original values before grouping summaries
        const sourceForTotals = filteredData; 

        summaries.forEach(summary => {
            const values = sourceForTotals.map(row => getColumnValue(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
            let totalValue: number | string = 0;
            if (values.length > 0) {
                switch (summary.type) {
                case 'sum':
                    totalValue = values.reduce((acc, val) => acc + val, 0);
                    break;
                case 'average':
                     // Average of averages is not meaningful. Average of original values.
                    totalValue = values.reduce((acc, val) => acc + val, 0) / values.length;
                    break;
                case 'count':
                    totalValue = values.length; // Count of original items
                    break;
                }
            } else if (summary.type === 'count') {
                totalValue = 0;
            } else {
                totalValue = 'N/A';
            }
            grandTotalRow![`${summary.column}_${summary.type}`] = summary.type === 'average' ? parseFloat(totalValue.toFixed(2)) : totalValue;
        });
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}
