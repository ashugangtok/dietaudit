
"use client";

import { useMemo, useCallback } from 'react';
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
  filteredData: DietDataRow[]; // Data after initial filtering, before pivoting/grouping
}

const parseTime = (timeStr: string | undefined | number): { hours: number; minutes: number } | null => {
  if (typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
};

const getColumnValueInternal = (row: DietDataRow, column: string): any => {
    let value = row[column];
    if (NUMERIC_COLUMNS.includes(column as keyof DietDataRow)) {
      const parsedValue = parseFloat(value as string);
      return isNaN(parsedValue) ? 0 : parsedValue;
    }
    if (DATE_COLUMNS.includes(column as keyof DietDataRow)) {
      return value ? new Date(value as string).toLocaleDateString() : '';
    }
    return value;
  };


export function calculateProcessedTableData(
  rawDataToProcess: DietDataRow[],
  groupingsToApply: GroupingOption[],
  summariesToApply: SummarizationOption[],
  filtersToApply: FilterOption[],
  allHeadersForData: string[],
  shouldProcessData: boolean
): ProcessedTableData {

  const internalFilteredDataResult = useMemo(() => {
    if (!shouldProcessData || !filtersToApply.length) return rawDataToProcess;
    
    return rawDataToProcess.filter(row => {
      return filtersToApply.every(filter => {
        const rowValue = getColumnValueInternal(row, filter.column);
         if (rowValue === undefined && Object.keys(row).includes(filter.column) ) {
        } else if (rowValue === undefined || rowValue === null) {
            if (filter.type === 'equals' && filter.value === '') return true; 
            return false;
        }

        const filterValue = filter.value;
        const normalizedRowValue = String(rowValue).toLowerCase();

        switch (filter.type) {
          case 'equals':
            return normalizedRowValue === String(filterValue).toLowerCase();
          case 'contains':
            if (filterValue === '') return true;
            return normalizedRowValue.includes(String(filterValue).toLowerCase());
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
          case 'timeOfDay':
            const mealTime = parseTime(row[filter.column] as string); 
            if (!mealTime) return false; 

            switch(filter.value) {
                case 'before6am': 
                    return mealTime.hours < 6;
                case '6to12': 
                    return mealTime.hours >= 6 && mealTime.hours < 12;
                case '12to6': 
                    return mealTime.hours >= 12 && mealTime.hours < 18;
                case 'after6pm': 
                    return mealTime.hours >= 18;
                case 'all':
                default:
                    return true;
            }
          default:
            return true;
        }
      });
    });
  }, [rawDataToProcess, filtersToApply, shouldProcessData]);

  const isSpecialPivotModeActive = useMemo(() => {
    if (!shouldProcessData) return false;

    if (summariesToApply.length === 1 && summariesToApply[0].column === SPECIAL_PIVOT_UOM_VALUE_FIELD && summariesToApply[0].type === 'sum') {
      const currentGroupingCols = groupingsToApply.map(g => g.column);
      const allExpectedGroupingsPresent = SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => currentGroupingCols.includes(col as string));
      const correctNumberOfGroupings = currentGroupingCols.length === SPECIAL_PIVOT_UOM_ROW_GROUPINGS.length;

      return allExpectedGroupingsPresent &&
             correctNumberOfGroupings &&
             allHeadersForData.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD) &&
             allHeadersForData.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD);
    }
    return false;
  }, [groupingsToApply, summariesToApply, allHeadersForData, shouldProcessData]);

  const processedDataAndColumnsResult = useMemo((): { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    if (!shouldProcessData) {
      return { data: [], dynamicColumns: allHeadersForData.length > 0 ? allHeadersForData : [], grandTotalRow: undefined };
    }

    let dataToProcess = [...internalFilteredDataResult];
    let dynamicColumns: string[] = dataToProcess.length > 0 && dataToProcess[0] ? Object.keys(dataToProcess[0]) : (allHeadersForData.length > 0 ? allHeadersForData : []);
    let grandTotalRow: DietDataRow | undefined = undefined;

    if (isSpecialPivotModeActive) {
      const rowKeyColumns = SPECIAL_PIVOT_UOM_ROW_GROUPINGS as string[];
      const pivotColName = SPECIAL_PIVOT_UOM_COLUMN_FIELD;
      const valueColName = SPECIAL_PIVOT_UOM_VALUE_FIELD;

      const uniquePivotColumnValues = [...new Set(internalFilteredDataResult.map(row => String(row[pivotColName] || 'Unknown')).filter(val => val.trim() !== ''))].sort();
      dynamicColumns = [...rowKeyColumns, ...uniquePivotColumnValues];
      const pivotedDataMap = new Map<string, DietDataRow>();

      for (const row of internalFilteredDataResult) {
        const keyParts = rowKeyColumns.map(col => String(row[col] || ''));
        const mapKey = keyParts.join('||');

        if (!pivotedDataMap.has(mapKey)) {
          const baseRow: DietDataRow = {};
          rowKeyColumns.forEach((col, index) => {
            baseRow[col] = keyParts[index];
          });
          uniquePivotColumnValues.forEach(pivotVal => {
            baseRow[pivotVal] = undefined;
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
      dataToProcess.forEach(pivotedRow => {
        uniquePivotColumnValues.forEach(pivotCol => {
          if (typeof pivotedRow[pivotCol] === 'number') {
            pivotedRow[pivotCol] = parseFloat((pivotedRow[pivotCol] as number).toFixed(2));
          } else if (pivotedRow[pivotCol] === undefined) {
             pivotedRow[pivotCol] = '';
          }
        });
      });
      dataToProcess.sort((a, b) => {
        for (const col of rowKeyColumns) {
          const valA = String(a[col] || '').toLowerCase();
          const valB = String(b[col] || '').toLowerCase();
          if (valA < valB) return -1;
          if (valA > valB) return 1;
        }
        return 0;
      });
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
      if (dataToProcess.length > 0) {
        grandTotalRow = { note: "Grand Total" };
        if (rowKeyColumns.length > 0) {
          grandTotalRow[rowKeyColumns[0]] = "Grand Total";
          for (let i = 1; i < rowKeyColumns.length; i++) {
            grandTotalRow[rowKeyColumns[i]] = PIVOT_BLANK_MARKER;
          }
        }
        uniquePivotColumnValues.forEach(pivotColValue => {
          const total = internalFilteredDataResult.reduce((sum, currentRow) => {
            if (String(currentRow[pivotColName] || 'Unknown') === pivotColValue) {
                const val = parseFloat(String(currentRow[valueColName] || '0'));
                return sum + (isNaN(val) ? 0 : val);
            }
            return sum;
          }, 0);
          grandTotalRow![pivotColValue] = parseFloat(total.toFixed(2));
        });
      }
      return { data: dataToProcess, dynamicColumns, grandTotalRow };
    }

    const groupingColNames = groupingsToApply.map(g => g.column);
    if (groupingsToApply.length > 0) {
      const grouped = new Map<string, DietDataRow[]>();
      dataToProcess.forEach(row => {
        const groupKey = groupingsToApply.map(g => getColumnValueInternal(row, g.column)).join(' | ');
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(row);
      });

      const result: DietDataRow[] = [];
      const summaryColNames = summariesToApply.map(s => `${s.column}_${s.type}`);
      dynamicColumns = [...new Set([...groupingColNames, ...summaryColNames].filter(col => col !== 'note'))];
      if (summariesToApply.length === 0 && dataToProcess.length > 0 && dataToProcess[0] && groupingsToApply.length > 0) {
        const originalCols = Object.keys(dataToProcess[0]);
        const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
        dynamicColumns = [...groupingColNames, ...otherCols];
      }

      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: PIVOT_SUBTOTAL_MARKER };
        const groupKeyValues = groupKey.split(' | ');
        groupingsToApply.forEach((g, idx) => {
            const originalValue = groupKeyValues[idx];
            representativeRow[g.column] = (originalValue === "undefined" || originalValue === "null") ? "" : originalValue;
        });
        if (summariesToApply.length > 0) {
          summariesToApply.forEach(summary => {
            const values = groupRows.map(row => getColumnValueInternal(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
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
              summaryValue = ''; // Changed from N/A to empty string for consistency
            }
            const valueToSet = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            representativeRow[`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
          });
        } else if (groupRows.length > 0 && groupRows[0]) {
            const originalCols = Object.keys(groupRows[0]);
            const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
            otherCols.forEach(col => {
                representativeRow[col] = getColumnValueInternal(groupRows[0], col);
            });
        }
        result.push(representativeRow);
      });
      dataToProcess = result;
      dataToProcess.sort((a, b) => {
        for (const col of groupingColNames) {
          const valA = getColumnValueInternal(a, col); 
          const valB = getColumnValueInternal(b, col); 
          if (valA === undefined || valA === null || valA === "") { // Treat blanks as smallest
            if (valB === undefined || valB === null || valB === "") return 0; // blanks equal
            return -1; // blank is smaller
          }
          if (valB === undefined || valB === null || valB === "") return 1; // B is blank, A is not, so A is larger
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
      let lastNonSubtotalRowKeyValues: (string | number | undefined)[] = [];
      dataToProcess = dataToProcess.map((row, rowIndex) => {
        if (row.note === PIVOT_SUBTOTAL_MARKER) {
        }
        if (rowIndex === 0 || (dataToProcess[rowIndex-1]?.note === PIVOT_SUBTOTAL_MARKER && row.note !== PIVOT_SUBTOTAL_MARKER)) {
            lastNonSubtotalRowKeyValues = groupingColNames.map(col => row[col]);
            return row;
        }
        const currentRowKeyValues = groupingColNames.map(col => row[col]);
        const newRow = { ...row };
        let sameAsLast = true;
        for (let i = 0; i < groupingColNames.length; i++) {
          if (sameAsLast && currentRowKeyValues[i] === lastNonSubtotalRowKeyValues[i]) {
            newRow[groupingColNames[i]] = PIVOT_BLANK_MARKER;
          } else {
            sameAsLast = false;
          }
        }
        lastNonSubtotalRowKeyValues = currentRowKeyValues;
        return newRow;
      });
    } else if (summariesToApply.length > 0 && dataToProcess.length > 0) {
        const summaryRow: DietDataRow = { note: "Overall Summary" };
        dynamicColumns = summariesToApply.map(s => `${s.column}_${s.type}`);
        summariesToApply.forEach(summary => {
            const values = dataToProcess.map(row => getColumnValueInternal(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
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
                summaryValue = '';
            }
            const valueToSet = summary.type === 'average' && typeof summaryValue === 'number' ? parseFloat(summaryValue.toFixed(2)) : summaryValue;
            summaryRow[`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
        });
        if (dynamicColumns.length > 0 && !summariesToApply.map(s => s.column + "_" + s.type).includes(dynamicColumns[0])) {
             summaryRow[dynamicColumns[0]] = "Overall Summary";
        } else if (dynamicColumns.length > 0) {
             const firstSummaryCol = dynamicColumns[0];
             const originalFirstColName = firstSummaryCol.substring(0, firstSummaryCol.lastIndexOf('_'));
             summaryRow[firstSummaryCol] = `Overall Summary for ${originalFirstColName.replace(/_/g, ' ')}`;
        }
        dataToProcess = [summaryRow];
    }

    if (summariesToApply.length > 0 && internalFilteredDataResult.length > 0 && !grandTotalRow && (groupingsToApply.length > 0 || dataToProcess.some(r => r.note === "Overall Summary"))) {
        grandTotalRow = { note: "Grand Total" };
        if(groupingColNames.length > 0) {
            grandTotalRow[groupingColNames[0]] = "Grand Total";
             for (let i = 1; i < groupingColNames.length; i++) {
                grandTotalRow[groupingColNames[i]] = PIVOT_BLANK_MARKER;
            }
        } else if (dynamicColumns.length > 0 && !summariesToApply.map(s => s.column + "_" + s.type).includes(dynamicColumns[0])) {
             grandTotalRow[dynamicColumns[0]] = "Grand Total";
        }
        summariesToApply.forEach(summary => {
            const values = internalFilteredDataResult.map(row => getColumnValueInternal(row, summary.column)).filter(v => typeof v === 'number' && !isNaN(v)) as number[];
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
                totalValue = '';
            }
            const valueToSet = summary.type === 'average' && typeof totalValue === 'number' ? parseFloat(totalValue.toFixed(2)) : totalValue;
            grandTotalRow![`${summary.column}_${summary.type}`] = typeof valueToSet === 'number' && NUMERIC_COLUMNS.includes(summary.column as keyof DietDataRow) ? parseFloat(valueToSet.toFixed(2)) : valueToSet;
        });
    }

    dynamicColumns = dynamicColumns.filter(col => col !== 'note');
    if (grandTotalRow && grandTotalRow.note === "Grand Total") {
        const firstMeaningfulCol = groupingColNames.length > 0 ? groupingColNames[0] : (dynamicColumns.find(c => !summariesToApply.some(s => `${s.column}_${s.type}` === c)));
        if (firstMeaningfulCol && !Object.keys(grandTotalRow).includes(firstMeaningfulCol)) {
            const tempFirstCol = dynamicColumns[0] || 'description';
            grandTotalRow[tempFirstCol] = "Grand Total";
        } else if (firstMeaningfulCol && grandTotalRow[firstMeaningfulCol] !== "Grand Total" && groupingColNames.length === 0) {
             const firstKeyToSetGT = Object.keys(grandTotalRow).find(k => k !== 'note' && !summariesToApply.some(s => `${s.column}_${s.type}` === k));
             if (firstKeyToSetGT && grandTotalRow[firstKeyToSetGT] !== "Grand Total") {
                grandTotalRow[firstKeyToSetGT] = "Grand Total";
             } else if (!firstKeyToSetGT && dynamicColumns.length > 0) {
                grandTotalRow[dynamicColumns[0]] = `Grand Total (${dynamicColumns[0].substring(0, dynamicColumns[0].lastIndexOf('_')).replace(/_/g, ' ')})`;
             }
        }
    }
    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [internalFilteredDataResult, groupingsToApply, summariesToApply, getColumnValueInternal, isSpecialPivotModeActive, allHeadersForData, shouldProcessData]);

  return {
    processedData: processedDataAndColumnsResult.data,
    columns: processedDataAndColumnsResult.dynamicColumns,
    grandTotalRow: processedDataAndColumnsResult.grandTotalRow,
    filteredData: internalFilteredDataResult,
  };
}


export function useTableProcessor({
  rawData,
  groupings,
  summaries,
  filters,
  allHeaders,
  hasAppliedFilters,
}: UseTableProcessorProps): ProcessedTableData {
    // This hook now simply calls the extracted logic.
    // The useCallback for getColumnValue is not directly used here anymore but the logic is inside getColumnValueInternal
    // The main useMemo calls are now inside calculateProcessedTableData
    return calculateProcessedTableData(rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters);
}
