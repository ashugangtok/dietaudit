
"use client";

import { useMemo, useCallback } from 'react';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { NUMERIC_COLUMNS, DATE_COLUMNS, PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER, EXPECTED_PIVOT_ROW_GROUPINGS, PIVOT_COLUMN_FIELD, PIVOT_VALUE_FIELD } from '@/types';

interface UseTableProcessorProps {
  rawData: DietDataRow[];
  groupings: GroupingOption[];
  summaries: SummarizationOption[];
  filters: FilterOption[];
  allHeaders: string[]; // Pass allHeaders to determine if special pivot mode can be applied
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
  allHeaders,
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
          default:
            return true;
        }
      });
    });
  }, [rawData, filters, getColumnValue]);

  const isSpecialPivotMode = useMemo(() => {
    if (summaries.length === 1 && summaries[0].column === PIVOT_VALUE_FIELD && summaries[0].type === 'sum') {
      const currentGroupingCols = groupings.map(g => g.column);
      return EXPECTED_PIVOT_ROW_GROUPINGS.every(col => currentGroupingCols.includes(col as string)) &&
             currentGroupingCols.length === EXPECTED_PIVOT_ROW_GROUPINGS.length &&
             allHeaders.includes(PIVOT_COLUMN_FIELD) &&
             allHeaders.includes(PIVOT_VALUE_FIELD);
    }
    return false;
  }, [groupings, summaries, allHeaders]);


  const processedDataAndColumns = useMemo((): { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    let dataToProcess = [...filteredData];
    let dynamicColumns: string[] = dataToProcess.length > 0 && dataToProcess[0] ? Object.keys(dataToProcess[0]) : [];
    let grandTotalRow: DietDataRow | undefined = undefined;

    if (isSpecialPivotMode) {
      const rowKeyColumns = EXPECTED_PIVOT_ROW_GROUPINGS as string[];
      const pivotColName = PIVOT_COLUMN_FIELD;
      const valueColName = PIVOT_VALUE_FIELD;

      const uniquePivotColumnValues = [...new Set(filteredData.map(row => row[pivotColName] as string))].sort();
      dynamicColumns = [...rowKeyColumns, ...uniquePivotColumnValues];
      const pivotedDataMap = new Map<string, DietDataRow>();

      for (const row of filteredData) {
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
        const currentPivotActualValue = row[pivotColName] as string;
        const qty = parseFloat(String(row[valueColName] || '0'));

        if (!isNaN(qty)) {
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
             pivotedRow[pivotCol] = ''; // Display empty string for undefined cells
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

      if (dataToProcess.length > 0) {
        grandTotalRow = { note: "Grand Total" };
        if (rowKeyColumns.length > 0) {
          grandTotalRow[rowKeyColumns[0]] = "Grand Total";
          for (let i = 1; i < rowKeyColumns.length; i++) {
            grandTotalRow[rowKeyColumns[i]] = PIVOT_BLANK_MARKER;
          }
        }
        uniquePivotColumnValues.forEach(pivotColValue => {
          const total = dataToProcess.reduce((sum, currentRow) => {
            const val = parseFloat(String(currentRow[pivotColValue] || '0'));
            return sum + (isNaN(val) ? 0 : val);
          }, 0);
          grandTotalRow![pivotColValue] = parseFloat(total.toFixed(2));
        });
      }
      return { data: dataToProcess, dynamicColumns, grandTotalRow };
    }

    // Fallback to existing logic if not in special pivot mode
    const groupingColNames = groupings.map(g => g.column);
    if (groupings.length > 0) {
      const grouped = new Map<string, DietDataRow[]>();
      dataToProcess.forEach(row => {
        const groupKey = groupings.map(g => getColumnValue(row, g.column)).join(' | ');
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(row);
      });

      const result: DietDataRow[] = [];
      const summaryColNames = summaries.map(s => `${s.column}_${s.type}`);
      
      dynamicColumns = [...new Set([...groupingColNames, ...summaryColNames].filter(col => col !== 'note'))];
      if (summaries.length === 0 && dataToProcess.length > 0 && dataToProcess[0] && groupings.length > 0) {
        const originalCols = Object.keys(dataToProcess[0]);
        const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
        dynamicColumns = [...groupingColNames, ...otherCols];
      }


      grouped.forEach((groupRows, groupKey) => {
        const representativeRow: DietDataRow = { note: PIVOT_SUBTOTAL_MARKER };
        const groupKeyValues = groupKey.split(' | ');

        groupings.forEach((g, idx) => {
          if (idx === 0) {
            representativeRow[g.column] = `Subtotal for ${groupKeyValues[idx]}`;
          } else {
            representativeRow[g.column] = groupKeyValues[idx];
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
        } else if (groupRows.length > 0 && groupRows[0]) {
            const originalCols = Object.keys(groupRows[0]);
            const otherCols = originalCols.filter(col => !groupingColNames.includes(col) && col !== 'note');
            otherCols.forEach(col => {
                representativeRow[col] = getColumnValue(groupRows[0], col);
            });
        }
        result.push(representativeRow);
      });
      dataToProcess = result;
      
      dataToProcess.sort((a, b) => {
        for (const col of groupingColNames) {
          const valA_raw = getColumnValue(a, col);
          const valB_raw = getColumnValue(b, col);
          const valA = (col === groupingColNames[0] && String(valA_raw).startsWith('Subtotal for ')) 
                       ? String(valA_raw).replace('Subtotal for ', '') 
                       : valA_raw;
          const valB = (col === groupingColNames[0] && String(valB_raw).startsWith('Subtotal for '))
                       ? String(valB_raw).replace('Subtotal for ', '')
                       : valB_raw;
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

    } else if (summaries.length > 0 && dataToProcess.length > 0) { 
        const summaryRow: DietDataRow = { note: "Overall Summary" }; 
        dynamicColumns = summaries.map(s => `${s.column}_${s.type}`);
        
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
        if (dynamicColumns.length > 0) {
            summaryRow[dynamicColumns[0]] = "Overall Summary"; // Or descriptive text
        }
        dataToProcess = [summaryRow];
    }
    
    // Grand Total Row for non-special pivot mode
    if (summaries.length > 0 && filteredData.length > 0 && !grandTotalRow && (groupings.length > 0 || dataToProcess.some(r => r.note === "Overall Summary"))) {
        grandTotalRow = { note: "Grand Total" }; 
        const firstColKey = dynamicColumns.length > 0 && !summaries.some(s => `${s.column}_${s.type}` === dynamicColumns[0]) ? dynamicColumns[0] : 'note_description';
        
        if(groupingColNames.length > 0) {
            grandTotalRow[groupingColNames[0]] = "Grand Total";
             for (let i = 1; i < groupingColNames.length; i++) {
                grandTotalRow[groupingColNames[i]] = PIVOT_BLANK_MARKER;
            }
        } else if (dynamicColumns.length > 0 && !summaries.map(s => s.column + "_" + s.type).includes(dynamicColumns[0])) {
             grandTotalRow[dynamicColumns[0]] = "Grand Total";
        }


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
    if (grandTotalRow && grandTotalRow.note === "Grand Total") {
        const firstMeaningfulCol = groupingColNames.length > 0 ? groupingColNames[0] : (dynamicColumns.find(c => !summaries.some(s => `${s.column}_${s.type}` === c)));
        if (firstMeaningfulCol && !Object.keys(grandTotalRow).includes(firstMeaningfulCol)) {
            // This case might be tricky if dynamicColumns doesn't align perfectly.
            // For now, assume the first grand total column is set correctly above.
        } else if (firstMeaningfulCol && grandTotalRow[firstMeaningfulCol] !== "Grand Total" && groupingColNames.length === 0) {
             // If no groupings, and the first column in grand total isn't "Grand Total", set it.
             const firstKeyToSetGT = Object.keys(grandTotalRow).find(k => k !== 'note' && !summaries.some(s => `${s.column}_${s.type}` === k));
             if (firstKeyToSetGT) grandTotalRow[firstKeyToSetGT] = "Grand Total";
        }
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  }, [filteredData, groupings, summaries, getColumnValue, isSpecialPivotMode, allHeaders]);

  return {
    processedData: processedDataAndColumns.data,
    columns: processedDataAndColumns.dynamicColumns,
    grandTotalRow: processedDataAndColumns.grandTotalRow,
  };
}
