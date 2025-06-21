
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
  filteredData: DietDataRow[];
}

const getColumnValueInternal = (row: DietDataRow, column: string): any => {
    let value = row[column];
    if (NUMERIC_COLUMNS.includes(column as keyof DietDataRow)) {
      const parsedValue = parseFloat(value as string);
      return isNaN(parsedValue) ? ( (value === '' || value === undefined || value === null) ? '' : 0 ) : parsedValue;
    }
    if (DATE_COLUMNS.includes(column as keyof DietDataRow)) {
      return value ? new Date(value as string).toLocaleDateString() : '';
    }
    return value === undefined || value === null ? '' : value;
  };


export function calculateProcessedTableData(
  rawDataToProcess: DietDataRow[],
  groupingsToApply: GroupingOption[],
  summariesToApply: SummarizationOption[],
  filtersToApply: FilterOption[],
  allHeadersForData: string[],
  shouldProcessData: boolean,
  disableDisplayBlanking: boolean = false
): ProcessedTableData {

  const internalFilteredDataResult = (() => {
    if (!shouldProcessData || !filtersToApply.length) return rawDataToProcess;
    
    return rawDataToProcess.filter(row => {
      return filtersToApply.every(filter => {
        const rowValue = getColumnValueInternal(row, filter.column);
        
        if (rowValue === '' && filter.type === 'equals' && filter.value === '') return true;
        if (rowValue === '' && filter.type !== 'equals' ) return false;


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
  })();

  const isSpecialPivotModeActive = (() => {
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
  })();

  const processedDataAndColumnsResult = ((): { data: DietDataRow[], dynamicColumns: string[], grandTotalRow?: DietDataRow } => {
    if (!shouldProcessData || (rawDataToProcess.length === 0 && allHeadersForData.length === 0)) {
      return { data: [], dynamicColumns: allHeadersForData.length > 0 ? allHeadersForData : [], grandTotalRow: undefined };
    }
    
    let dataToProcess: DietDataRow[] = [...internalFilteredDataResult];
    let dynamicColumns: string[] = [];
    if (dataToProcess.length > 0 && dataToProcess[0]) {
        dynamicColumns = Object.keys(dataToProcess[0]);
    } else if (allHeadersForData.length > 0) {
        dynamicColumns = allHeadersForData;
    }


    let grandTotalRow: DietDataRow | undefined = undefined;
    let baseUomNameFirstSummaryKey = '';
    const ingredientQtyFirstSummaryKey = summariesToApply.find(s => s.column === 'ingredient_qty' && s.type === 'first')?.name || 'ingredient_qty_first';
    const totalAnimalFirstSummaryKey = summariesToApply.find(s => s.column === 'total_animal' && s.type === 'first')?.name || 'total_animal_first';
    const totalQtyRequiredCalculatedColKey = 'total_qty_required_calculated';


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
      
      if (!disableDisplayBlanking) {
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
    } else {
        const groupingColNames = groupingsToApply.map(g => g.column);
        const summaryColDetails = summariesToApply.map(s => ({
            name: `${s.column}_${s.type}`,
            originalColumn: s.column,
            type: s.type,
        }));
        
        baseUomNameFirstSummaryKey = summaryColDetails.find(s => s.originalColumn === 'base_uom_name' && s.type === 'first')?.name || '';
        
        dynamicColumns = [...groupingColNames, ...summaryColDetails.map(s => s.name)];
        
        if (allHeadersForData.includes('ingredient_qty') && allHeadersForData.includes('total_animal') && !dynamicColumns.includes(totalQtyRequiredCalculatedColKey)) {
             dynamicColumns.push(totalQtyRequiredCalculatedColKey);
        }

        if (groupingColNames.length > 0 && internalFilteredDataResult.length > 0) {
            const grouped = new Map<string, DietDataRow[]>();
            internalFilteredDataResult.forEach(row => {
                const groupKey = groupingColNames.map(gCol => getColumnValueInternal(row, gCol)).join('||');
                if (!grouped.has(groupKey)) grouped.set(groupKey, []);
                grouped.get(groupKey)!.push(row);
            });

            const result: DietDataRow[] = [];
            
            grouped.forEach((groupRows) => {
                const representativeRow: DietDataRow = {};
                const firstRowInGroup = groupRows[0];

                groupingColNames.forEach(gCol => {
                    representativeRow[gCol] = getColumnValueInternal(firstRowInGroup, gCol);
                });

                summaryColDetails.forEach(summary => {
                    const values = groupRows.map(row => getColumnValueInternal(row, summary.originalColumn));
                    let summaryValue: string | number = '';
                    const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v));

                    if (summary.originalColumn === 'total_animal' && summary.type === 'first') {
                        const animalIds = new Set<string>();
                        groupRows.forEach(row => {
                            if (row.animal_id && typeof row.animal_id === 'string' && row.animal_id.trim() !== '') {
                                animalIds.add(row.animal_id.trim());
                            }
                        });
                        summaryValue = animalIds.size > 0 ? animalIds.size : 0; 
                    } else {
                        switch (summary.type) {
                            case 'sum':
                                summaryValue = numericValues.reduce((acc, val) => acc + val, 0);
                                break;
                            case 'average':
                                summaryValue = numericValues.length > 0 ? numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length : 0;
                                break;
                            case 'count':
                                summaryValue = numericValues.length;
                                break;
                            case 'first':
                                summaryValue = getColumnValueInternal(firstRowInGroup, summary.originalColumn);
                                break;
                            case 'max':
                                summaryValue = numericValues.length > 0 ? Math.max(...numericValues) : 0;
                                break;
                            default:
                                summaryValue = '';
                        }
                    }

                    if (typeof summaryValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                        summaryValue = parseFloat(summaryValue.toFixed(4));
                    }
                    if (numericValues.length === 0 && !['first', 'count'].includes(summary.type) && !(summary.originalColumn === 'total_animal' && summary.type === 'first')) {
                         summaryValue = (summary.type === 'sum' || summary.type === 'average' || summary.type === 'max') ? 0 : '';
                    } else if (numericValues.length === 0 && summary.type === 'count') {
                        summaryValue = 0;
                    } else if (summary.type === 'first' && (summaryValue === undefined || summaryValue === null) && !(summary.originalColumn === 'total_animal' && summary.type === 'first')) {
                        summaryValue = '';
                    }
                    representativeRow[summary.name] = summaryValue;
                });
                
                if (representativeRow[ingredientQtyFirstSummaryKey] !== undefined && representativeRow[totalAnimalFirstSummaryKey] !== undefined) {
                    const qtyPerAnimal = parseFloat(String(representativeRow[ingredientQtyFirstSummaryKey]));
                    const animalCount = parseFloat(String(representativeRow[totalAnimalFirstSummaryKey]));
                    if (!isNaN(qtyPerAnimal) && !isNaN(animalCount)) {
                        representativeRow[totalQtyRequiredCalculatedColKey] = parseFloat((qtyPerAnimal * animalCount).toFixed(4));
                    } else {
                        representativeRow[totalQtyRequiredCalculatedColKey] = 0;
                    }
                } else {
                    representativeRow[totalQtyRequiredCalculatedColKey] = 0;
                }
                
                result.push(representativeRow);
            });
            
            dataToProcess = result;

            dataToProcess.sort((a, b) => {
                for (const col of groupingColNames) {
                    const valA = getColumnValueInternal(a, col);
                    const valB = getColumnValueInternal(b, col);
                    if (valA === PIVOT_BLANK_MARKER || valB === PIVOT_BLANK_MARKER) continue;
                    
                    const strA = String(valA).toLowerCase();
                    const strB = String(valB).toLowerCase();

                    if (strA < strB) return -1;
                    if (strA > strB) return 1;
                }
                return 0;
            });

            if (!disableDisplayBlanking && groupingColNames.length > 0) { 
                let lastActualKeyValues: (string | number | undefined)[] = new Array(groupingColNames.length).fill(undefined);
                const tempProcessedDataForBlanking = [...dataToProcess];
                dataToProcess = tempProcessedDataForBlanking.map((row, rowIndex) => {
                    const newRow = { ...row };
                    if (rowIndex === 0) {
                        groupingColNames.forEach((gCol, i) => {
                            lastActualKeyValues[i] = newRow[gCol];
                        });
                        return newRow;
                    }

                    let baseGroupChanged = false;
                    for (let i = 0; i < groupingColNames.length; i++) {
                        const gCol = groupingColNames[i];
                        const currentValue = newRow[gCol];
                        
                        if (baseGroupChanged) { 
                            lastActualKeyValues[i] = currentValue;
                            continue;
                        }

                        if (currentValue === lastActualKeyValues[i] && gCol !== 'ingredient_name') { 
                            newRow[gCol] = PIVOT_BLANK_MARKER;
                        } else {
                            lastActualKeyValues[i] = currentValue;
                            baseGroupChanged = true;
                        }
                    }
                    return newRow;
                });
            }
        } else if (summariesToApply.length > 0 && internalFilteredDataResult.length > 0) {
            const summaryRow: DietDataRow = { note: "Overall Summary" };
            summaryColDetails.forEach(summary => {
                let summaryValue: string | number = '';
                if (summary.originalColumn === 'total_animal' && summary.type === 'first') {
                    const animalIds = new Set<string>();
                    internalFilteredDataResult.forEach(row => {
                        if (row.animal_id && typeof row.animal_id === 'string' && row.animal_id.trim() !== '') {
                            animalIds.add(row.animal_id.trim());
                        }
                    });
                    summaryValue = animalIds.size > 0 ? animalIds.size : 0;
                } else {
                    const values = internalFilteredDataResult.map(row => getColumnValueInternal(row, summary.originalColumn));
                    const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v));
                    if (numericValues.length > 0) {
                         switch (summary.type) {
                             case 'sum': summaryValue = numericValues.reduce((acc, val) => acc + val, 0); break;
                             case 'average': summaryValue = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length; break;
                             case 'count': summaryValue = numericValues.length; break;
                             case 'first': summaryValue = getColumnValueInternal(internalFilteredDataResult[0], summary.originalColumn); break;
                             case 'max': summaryValue = Math.max(...numericValues); break;
                         }
                         if (typeof summaryValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                            summaryValue = parseFloat(summaryValue.toFixed(4));
                         }
                     } else if (summary.type === 'count') {
                         summaryValue = 0;
                     } else { 
                         if (summary.type === 'first' && internalFilteredDataResult.length > 0) {
                             summaryValue = getColumnValueInternal(internalFilteredDataResult[0], summary.originalColumn);
                         } else {
                             summaryValue = ''; 
                         }
                     }
                }
                summaryRow[summary.name] = summaryValue;
            });
            
            if (summaryRow[ingredientQtyFirstSummaryKey] !== undefined && summaryRow[totalAnimalFirstSummaryKey] !== undefined) {
                const qtyPerAnimal = parseFloat(String(summaryRow[ingredientQtyFirstSummaryKey]));
                const animalCount = parseFloat(String(summaryRow[totalAnimalFirstSummaryKey]));
                if (!isNaN(qtyPerAnimal) && !isNaN(animalCount)) {
                    summaryRow[totalQtyRequiredCalculatedColKey] = parseFloat((qtyPerAnimal * animalCount).toFixed(4));
                } else {
                    summaryRow[totalQtyRequiredCalculatedColKey] = 0;
                }
            } else {
                summaryRow[totalQtyRequiredCalculatedColKey] = 0;
            }
            
            if (dynamicColumns.length > 0 && !summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                summaryRow[dynamicColumns[0]] = "Overall Summary";
            } else if (dynamicColumns.length > 0 && summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                const firstOriginalCol = summaryColDetails.find(s => s.name === dynamicColumns[0])?.originalColumn || dynamicColumns[0];
                summaryRow[dynamicColumns[0]] = `Overall ${firstOriginalCol.replace(/_/g, ' ')}`;
            } else if (allHeadersForData.length > 0) {
                summaryRow[allHeadersForData[0]] = "Overall Summary"; 
            }
            dataToProcess = [summaryRow];
            
            dynamicColumns = [...summaryColDetails.map(s => s.name)];
            if (dynamicColumns.includes(ingredientQtyFirstSummaryKey) && dynamicColumns.includes(totalAnimalFirstSummaryKey)) {
                if(!dynamicColumns.includes(totalQtyRequiredCalculatedColKey)) {
                    dynamicColumns.push(totalQtyRequiredCalculatedColKey);
                }
            }

        } else {
          dataToProcess = internalFilteredDataResult.map(row => {
            const newRow = {...row};
            const qtyPerAnimalRaw = parseFloat(String(getColumnValueInternal(row, 'ingredient_qty'))); 
            const animalCountRaw = parseFloat(String(getColumnValueInternal(row, 'total_animal'))); 
            if (!isNaN(qtyPerAnimalRaw) && !isNaN(animalCountRaw)) {
                 newRow[totalQtyRequiredCalculatedColKey] = parseFloat((qtyPerAnimalRaw * animalCountRaw).toFixed(4));
            } else {
                newRow[totalQtyRequiredCalculatedColKey] = 0;
            }
            return newRow;
          });
          if (internalFilteredDataResult.length > 0 && allHeadersForData.includes('ingredient_qty') && allHeadersForData.includes('total_animal')) {
             if(!dynamicColumns.includes(totalQtyRequiredCalculatedColKey)) {
                 dynamicColumns.push(totalQtyRequiredCalculatedColKey);
             }
          } else if (internalFilteredDataResult.length === 0 && allHeadersForData.length > 0) {
            dynamicColumns = allHeadersForData; 
          }
        }

        if (summariesToApply.length > 0 && internalFilteredDataResult.length > 0) {
            grandTotalRow = { note: "Grand Total" };
            if (groupingColNames.length > 0) {
                grandTotalRow[groupingColNames[0]] = "Grand Total";
                for (let i = 1; i < groupingColNames.length; i++) {
                    grandTotalRow[groupingColNames[i]] = PIVOT_BLANK_MARKER;
                }
            } else if (dynamicColumns.length > 0 && !summaryColDetails.map(s => s.name).includes(dynamicColumns[0])) {
                grandTotalRow[dynamicColumns[0]] = "Grand Total";
            }

            summaryColDetails.forEach(summary => {
                let totalValue: string | number = '';
                if (summary.originalColumn === 'total_animal' && summary.type === 'first') {
                    const animalIds = new Set<string>();
                    internalFilteredDataResult.forEach(row => {
                        if (row.animal_id && typeof row.animal_id === 'string' && row.animal_id.trim() !== '') {
                            animalIds.add(row.animal_id.trim());
                        }
                    });
                    totalValue = animalIds.size > 0 ? animalIds.size : 0;
                } else {
                    const values = internalFilteredDataResult.map(row => getColumnValueInternal(row, summary.originalColumn));
                    const numericValues = values.map(v => parseFloat(String(v))).filter(v => !isNaN(v));

                     if (numericValues.length > 0) {
                         switch (summary.type) {
                             case 'sum': totalValue = numericValues.reduce((acc, val) => acc + val, 0); break;
                             case 'average': totalValue = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length; break;
                             case 'count': totalValue = numericValues.length; break;
                             case 'first': totalValue = getColumnValueInternal(internalFilteredDataResult[0], summary.originalColumn); break;
                             case 'max': totalValue = Math.max(...numericValues); break;
                         }
                          if (typeof totalValue === 'number' && (summary.type === 'sum' || summary.type === 'average')) {
                            totalValue = parseFloat(totalValue.toFixed(4));
                         }
                     } else if (summary.type === 'count') {
                         totalValue = 0;
                     } else {
                         if (summary.type === 'first' && internalFilteredDataResult.length > 0) {
                            totalValue = getColumnValueInternal(internalFilteredDataResult[0], summary.originalColumn);
                         } else {
                            totalValue = '';
                         }
                     }
                }
                grandTotalRow![summary.name] = totalValue;
            });
            
            let grandTotalRequiredQtySum = 0;
            grandTotalRequiredQtySum = dataToProcess.reduce((sum, procRow) => {
                const val = parseFloat(String(procRow[totalQtyRequiredCalculatedColKey]));
                return sum + (isNaN(val) ? 0 : val);
            }, 0);

            if(grandTotalRow && dynamicColumns.includes(totalQtyRequiredCalculatedColKey)) {
                grandTotalRow[totalQtyRequiredCalculatedColKey] = parseFloat(grandTotalRequiredQtySum.toFixed(4));
            }


            if (groupingColNames.length === 0 && summaryColDetails.length > 0 && grandTotalRow) {
                const firstSummaryColName = summaryColDetails[0].name;
                const originalGrandTotalValue = grandTotalRow[firstSummaryColName];
                const summaryColForGT = summaryColDetails.find(s => s.name === firstSummaryColName)?.originalColumn.replace(/_/g, ' ') || firstSummaryColName;

                if (originalGrandTotalValue !== undefined && String(originalGrandTotalValue).trim() !== '' && 
                    !(typeof originalGrandTotalValue === 'string' && originalGrandTotalValue.includes(summaryColForGT))
                ) {
                     grandTotalRow[firstSummaryColName] = `Grand Total (${summaryColForGT}: ${originalGrandTotalValue})`;
                } else if (grandTotalRow[firstSummaryColName] !== `Grand Total (${summaryColForGT})`) {
                     grandTotalRow[firstSummaryColName] = `Grand Total (${summaryColForGT})`;
                }
            }
        }
    } 
    
    dynamicColumns = dynamicColumns.filter(col => col !== 'note');
    if (baseUomNameFirstSummaryKey && !isSpecialPivotModeActive && !disableDisplayBlanking) { 
        // DataTable handles UoM concatenation
    }
    
    if (grandTotalRow && !Object.keys(grandTotalRow).some(k => k !== 'note' && String(grandTotalRow[k]).toLowerCase().includes("grand total"))) {
        const firstColForGTDisplay = dynamicColumns.length > 0 ? dynamicColumns[0] : 
                              (groupingsToApply.map(g=>g.column).length > 0 ? groupingsToApply.map(g=>g.column)[0] : 
                              (summariesToApply.map(s=>`${s.column}_${s.type}`).length > 0 ? summariesToApply.map(s=>`${s.column}_${s.type}`)[0] : undefined));
        
        if (firstColForGTDisplay && grandTotalRow[firstColForGTDisplay] !== PIVOT_BLANK_MARKER) {
             const gtValue = grandTotalRow[firstColForGTDisplay];
             if (!String(gtValue).toLowerCase().startsWith("grand total")) {
                grandTotalRow[firstColForGTDisplay] = 'Grand Total' + ((gtValue !== undefined && gtValue !== PIVOT_BLANK_MARKER && String(gtValue).trim() !== '') ? ` (${gtValue})` : '');
             }
        } else if (firstColForGTDisplay && grandTotalRow[firstColForGTDisplay] === PIVOT_BLANK_MARKER && groupingsToApply.map(g=>g.column).length === 0) {
             grandTotalRow[firstColForGTDisplay] = "Grand Total";
        }
    }
    
    if (dynamicColumns.includes(totalQtyRequiredCalculatedColKey)) {
        const qtyFirstIndex = dynamicColumns.indexOf(ingredientQtyFirstSummaryKey);
        const totalAnimalIndex = dynamicColumns.indexOf(totalAnimalFirstSummaryKey);
        const targetIndex = Math.max(qtyFirstIndex, totalAnimalIndex);

        if (targetIndex !== -1 && dynamicColumns.indexOf(totalQtyRequiredCalculatedColKey) !== targetIndex + 1) {
            dynamicColumns = dynamicColumns.filter(col => col !== totalQtyRequiredCalculatedColKey);
            dynamicColumns.splice(targetIndex + 1, 0, totalQtyRequiredCalculatedColKey);
        } else if (targetIndex === -1 && dynamicColumns.indexOf(totalQtyRequiredCalculatedColKey) === -1) {
            // If ingredient_qty_first and total_animal_first are not there, but calculation column might be, add it.
             dynamicColumns.push(totalQtyRequiredCalculatedColKey);
        }
    }


    return { data: dataToProcess, dynamicColumns, grandTotalRow };
  })();

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
    return useMemo(() => {
        return calculateProcessedTableData(rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters, false);
    }, [rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters]);
}
    
