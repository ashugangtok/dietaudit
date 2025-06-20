
"use client";

import type React from 'react';
import { useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { DietDataRow, GroupingOption } from '@/types';
import { PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER } from '@/types';

interface DataTableProps {
  data: DietDataRow[];
  columns: string[]; 
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
  isComparisonMode?: boolean;
  comparisonColumn?: string | null;
  actualQuantities?: Record<string, string>; 
  onActualQuantityChange?: (contentBasedKey: string, comparisonColumn: string, value: string) => void;
  groupingOptions: GroupingOption[]; 
  actualGroupQuantities?: Record<string, string>;
  onActualGroupQuantityChange?: (groupRowKey: string, comparisonColumn: string, value: string) => void;
}

const generateRowKey = (row: DietDataRow, allRelevantColumns: string[], isComparison: boolean, comparisonColName: string | null): string => {
  const keyValues: string[] = [];
  const stableCols = allRelevantColumns.filter(c => !c.startsWith("Actual ") && !c.startsWith("Difference ") && !c.startsWith("Planned Total for Group") && !c.startsWith("Actual Received for Group") && !c.startsWith("Group Difference"));

  for (const col of stableCols) {
    if (col === 'note') continue;

    const val = row[col];
    if (val === PIVOT_BLANK_MARKER) {
      keyValues.push(PIVOT_BLANK_MARKER);
    } else if (val === undefined || val === null) {
      keyValues.push("___NULL_OR_UNDEFINED___");
    } else {
       if (isComparison && typeof val === 'string' && col === comparisonColName) {
            const numericPart = parseFloat(val); 
            keyValues.push(isNaN(numericPart) ? String(val) : String(numericPart));
        } else {
            keyValues.push(String(val));
        }
    }
  }
  return keyValues.join('||');
};

const generateGroupRowKey = (row: DietDataRow, groupings: GroupingOption[], comparisonCol: string): string => {
    const keyParts: string[] = [];
    const groupNameColumn = groupings.find(g => g.column === 'group_name')?.column;

    if (!groupNameColumn) return `nogroup_${comparisonCol}_${Math.random()}`; 

    for (const gOpt of groupings) {
        const gCol = gOpt.column;
        const val = row[gCol];
        if (val !== PIVOT_BLANK_MARKER && val !== undefined && val !== null) {
            keyParts.push(String(val));
        } else {
            keyParts.push('__EMPTY_PART__'); 
        }
        if (gCol === groupNameColumn) break; 
    }
    keyParts.push(comparisonCol);
    return keyParts.join('||');
};


const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
  isComparisonMode = false,
  comparisonColumn,
  actualQuantities = {},
  onActualQuantityChange,
  groupingOptions = [],
  actualGroupQuantities = {},
  onActualGroupQuantityChange,
}) => {
  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  const effectiveDisplayColumns = useMemo(() => {
    let colsToDisplay = [...columns]; // `columns` prop already reflects tab-specific column list
    if (isComparisonMode && comparisonColumn && columns.includes(comparisonColumn)) {
      const plannedColIndex = colsToDisplay.indexOf(comparisonColumn);
      const actualIndividualCol = `Actual ${comparisonColumn}`;
      const diffIndividualCol = `Difference ${comparisonColumn}`;
      
      if (!colsToDisplay.includes(actualIndividualCol)) {
          if (plannedColIndex !== -1) {
            colsToDisplay.splice(plannedColIndex + 1, 0, actualIndividualCol);
          } else {
            colsToDisplay.push(actualIndividualCol);
          }
      }
      if (!colsToDisplay.includes(diffIndividualCol)) {
           const actualIdx = colsToDisplay.indexOf(actualIndividualCol);
           if (actualIdx !== -1) {
                colsToDisplay.splice(actualIdx + 1, 0, diffIndividualCol);
           } else {
                colsToDisplay.push(diffIndividualCol);
           }
      }
    }
    // Group-level columns like "Actual Received for Group" are expected to be in `columns` prop if in comparison mode
    // Filtering for 'note' and 'base_uom_name_first' is done if they are not needed for display logic
    // For non-comparison mode, 'base_uom_name_first' IS used for UoM concatenation, so it shouldn't be filtered here for those tabs.
    // page.tsx controls which columns are passed to DataTable.
    // If 'base_uom_name_first' is not in the `columns` prop for non-comparison, it won't be an issue.
    // If it *is* needed (as it is for View Data/Export Section for UoM concat), it must *not* be filtered here.
    // useTableProcessor already removes it from its returned `columns` if it's purely internal.
    // So, this filter is likely redundant or might cause issues if not handled carefully.
    // For now, let's assume `columns` prop is exactly what needs to be considered for display.
    // The filter for 'note' is generally safe.
    colsToDisplay = colsToDisplay.filter(col => col !== 'note');
    return colsToDisplay;
  }, [columns, isComparisonMode, comparisonColumn]);

  if (!data.length && !grandTotalRow && !isComparisonMode) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }
   if (isComparisonMode && (!data.length && !grandTotalRow) && !comparisonColumn) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data for comparison. Ensure filters are applied and a comparison column is selected.</p>
      </div>
    );
  }

  const dietNameColumnKey = 'diet_name';
  // const ingredientQtySumKey = columns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum')) || 'ingredient_qty_sum';
  const baseUomNameFirstKey = 'base_uom_name_first';


  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview {isComparisonMode ? "(Comparison Mode)" : ""}</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column;
               if (column.startsWith('total_animal_') && !isComparisonMode) {
                 headerText = 'Total Animal';
               } else if (isComparisonMode && column.startsWith('Planned Total for Group')) { // Only apply for comparison mode
                  headerText = `Planned Group Total`;
               } else if (isComparisonMode && column.startsWith('Actual Received for Group')) { // Only apply for comparison mode
                  headerText = `Actual Group Received`;
               } else if (isComparisonMode && column.startsWith('Group Difference')) { // Only apply for comparison mode
                  headerText = `Group Diff.`;
               } else {
                 headerText = column.replace(/_/g, ' ');
               }
              headerText = headerText.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
              if (isComparisonMode && headerText.includes(`(${comparisonColumn})`)) {
                  headerText = headerText.replace(`(${comparisonColumn})`, '').trim();
              }
               if (isComparisonMode && comparisonColumn && headerText.toLowerCase().includes(comparisonColumn.replace(/_/g, ' ').toLowerCase())) {
                  headerText = headerText.replace(comparisonColumn.replace(/_/g, ' '), 'Planned Qty');
               }


              return (<TableHead key={column} className="font-semibold whitespace-nowrap">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            const contentBasedKey = generateRowKey(row, columns, isComparisonMode, comparisonColumn); 
            const tableRowReactKey = `${contentBasedKey}_react_map_${rowIndex}`;

            const groupNameCol = groupingOptions.find(g => g.column === 'group_name')?.column;
            const commonNameColKey = groupingOptions.find(g => g.column === 'common_name')?.column;
            
            let isGroupSubtotalRow = false;
            if (isComparisonMode && comparisonColumn && groupNameCol && row[groupNameCol] && row[groupNameCol] !== PIVOT_BLANK_MARKER && row.note === PIVOT_SUBTOTAL_MARKER) {
                const groupNameIndex = groupingOptions.findIndex(g => g.column === groupNameCol);
                if (groupNameIndex !== -1 && groupNameIndex < groupingOptions.length -1) {
                    const nextGroupingCol = groupingOptions[groupNameIndex+1].column;
                    if (row[nextGroupingCol] === PIVOT_BLANK_MARKER || row[nextGroupingCol] === undefined) {
                        isGroupSubtotalRow = true;
                    }
                } else if (groupNameIndex !== -1 && groupingOptions.length === groupNameIndex + 1) {
                    isGroupSubtotalRow = true;
                }
            }
            if (isComparisonMode && comparisonColumn && groupNameCol && row[groupNameCol] && row[groupNameCol] !== PIVOT_BLANK_MARKER && commonNameColKey && row[commonNameColKey] === PIVOT_BLANK_MARKER && row.note === PIVOT_SUBTOTAL_MARKER) {
                 isGroupSubtotalRow = true;
            }


            const groupRowKeyForActuals = isGroupSubtotalRow && comparisonColumn ? generateGroupRowKey(row, groupingOptions, comparisonColumn) : '';


            return (
              <TableRow
                  key={tableRowReactKey}
                  className={row.note === PIVOT_SUBTOTAL_MARKER ? "bg-secondary/70 font-semibold" : ""}
                  data-testid={`data-row-${rowIndex}`}
              >
                {effectiveDisplayColumns.map((column) => {
                  let cellContent: React.ReactNode;
                  const originalColumnName = column.startsWith("Actual ") ? column.substring(7) : (column.startsWith("Difference ") ? column.substring(11) : column);

                  if (isComparisonMode && comparisonColumn && column === `Actual ${comparisonColumn}`) {
                    const actualKey = `${contentBasedKey}_${comparisonColumn}`;
                    cellContent = (
                      <Input
                        type="number"
                        value={actualQuantities[actualKey] || ''}
                        onChange={(e) => onActualQuantityChange?.(contentBasedKey, comparisonColumn, e.target.value)}
                        className="h-8 text-right w-24"
                        placeholder="Actual"
                        disabled={row.note === PIVOT_SUBTOTAL_MARKER || isGroupSubtotalRow} 
                      />
                    );
                  } else if (isComparisonMode && comparisonColumn && column === `Difference ${comparisonColumn}`) {
                    const plannedValueStr = String(row[comparisonColumn] ?? '0'); 
                    const plannedValue = parseFloat(plannedValueStr); 
                    const actualValueStr = actualQuantities[`${contentBasedKey}_${comparisonColumn}`] || '';
                    const actualValue = parseFloat(actualValueStr);
                    let difference: string | number = '';
                    let differenceStyle: React.CSSProperties = {};

                    if (row.note !== PIVOT_SUBTOTAL_MARKER && actualValueStr !== '' && !isNaN(actualValue) && !isNaN(plannedValue)) {
                      const diffNum = actualValue - plannedValue;
                      difference = parseFloat(diffNum.toFixed(4));
                      if (diffNum > 0) differenceStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' };
                      if (diffNum < 0) differenceStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' };
                    }
                     cellContent = <span style={differenceStyle}>{typeof difference === 'number' ? difference.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : difference}</span>;
                  } else if (isComparisonMode && comparisonColumn && column === `Actual Received for Group (${comparisonColumn.replace(/_/g, ' ')})`) {
                      if (isGroupSubtotalRow && onActualGroupQuantityChange) {
                          cellContent = (
                              <Input
                                  type="number"
                                  value={actualGroupQuantities[groupRowKeyForActuals] || ''}
                                  onChange={(e) => onActualGroupQuantityChange(groupRowKeyForActuals, comparisonColumn, e.target.value)}
                                  className="h-8 text-right w-24"
                                  placeholder="Group Actual"
                              />
                          );
                      } else {
                          cellContent = '';
                      }
                  } else if (isComparisonMode && comparisonColumn && column === `Group Difference (${comparisonColumn.replace(/_/g, ' ')})`) {
                      if (isGroupSubtotalRow) {
                          const plannedGroupValueStr = String(row[comparisonColumn] ?? '0'); 
                          const plannedGroupValue = parseFloat(plannedGroupValueStr);
                          const actualGroupValueStr = actualGroupQuantities[groupRowKeyForActuals] || '';
                          const actualGroupValue = parseFloat(actualGroupValueStr);
                          let groupDiff: string | number = '';
                          let groupDiffStyle: React.CSSProperties = {};

                          if (actualGroupValueStr !== '' && !isNaN(actualGroupValue) && !isNaN(plannedGroupValue)) {
                              const diffNum = actualGroupValue - plannedGroupValue;
                              groupDiff = parseFloat(diffNum.toFixed(4));
                              if (diffNum > 0) groupDiffStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' };
                              if (diffNum < 0) groupDiffStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' };
                          }
                          cellContent = <span style={groupDiffStyle}>{typeof groupDiff === 'number' ? groupDiff.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4}) : groupDiff}</span>;
                      } else {
                          cellContent = '';
                      }
                  } else if (!isComparisonMode && originalColumnName.startsWith('ingredient_qty_') && originalColumnName.endsWith('_sum')) {
                      // Logic for View Data / Export Section tabs to concatenate UoM
                      const qtyValue = row[originalColumnName];
                      const uom = row[baseUomNameFirstKey]; // Assumes base_uom_name_first is on the row from useTableProcessor
                      if (typeof qtyValue === 'number' && typeof uom === 'string' && uom.trim() !== '') {
                          cellContent = `${qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                      } else if (typeof qtyValue === 'number') {
                          cellContent = qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                      } else {
                          cellContent = (qtyValue === undefined || qtyValue === null || qtyValue === PIVOT_BLANK_MARKER ? '' : String(qtyValue));
                      }
                  } else {
                    const cellValue = row[originalColumnName];
                    if (cellValue === PIVOT_BLANK_MARKER) {
                      cellContent = '';
                    } else if (typeof cellValue === 'number') {
                      cellContent = Number.isInteger(cellValue) ? String(cellValue) : cellValue.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
                    } else {
                      cellContent = (cellValue === undefined || cellValue === null ? '' : String(cellValue));
                    }
                  }

                  if (originalColumnName === dietNameColumnKey && typeof cellContent === 'string' && cellContent.includes('\n')) {
                    return (
                      <TableCell key={column} className="whitespace-nowrap">
                        <div style={{ whiteSpace: 'pre' }}>{cellContent}</div>
                      </TableCell>
                    );
                  }
                  
                  const isNumericOutputCol = typeof row[originalColumnName] === 'number' || 
                                          (isComparisonMode && (column.startsWith("Actual ") || column.startsWith("Difference ") || column.startsWith("Actual Received for Group") || column.startsWith("Group Difference"))) ||
                                          (!isComparisonMode && originalColumnName.startsWith('ingredient_qty_') && originalColumnName.endsWith('_sum'));

                  return (
                    <TableCell key={column} className={`whitespace-nowrap ${isNumericOutputCol ? "text-right" : ""}`}>
                      {cellContent}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
        {grandTotalRow && (
          <TableFooter className="sticky bottom-0 bg-secondary font-bold z-10 shadow-sm">
            <TableRow data-testid="grand-total-row">
              {effectiveDisplayColumns.map((column, colIndex) => {
                const originalColumnName = column.startsWith("Actual ") ? column.substring(7) : (column.startsWith("Difference ") ? column.substring(11) : column);
                let displayCellValue: React.ReactNode = "";

                if (isComparisonMode && comparisonColumn && column === `Actual ${comparisonColumn}`) {
                    let totalActual = 0;
                    let hasActuals = false;
                    data.forEach(dRow => {
                        if (dRow.note !== PIVOT_SUBTOTAL_MARKER) {
                            const rowContentKey = generateRowKey(dRow, columns, isComparisonMode, comparisonColumn);
                            const actualValStr = actualQuantities[`${rowContentKey}_${comparisonColumn}`];
                            if (actualValStr !== undefined && actualValStr !== '') {
                                const actualValNum = parseFloat(actualValStr);
                                if (!isNaN(actualValNum)) {
                                    totalActual += actualValNum;
                                    hasActuals = true;
                                }
                            }
                        }
                    });
                    displayCellValue = hasActuals ? parseFloat(totalActual.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : "";
                } else if (isComparisonMode && comparisonColumn && column === `Difference ${comparisonColumn}`) {
                    const plannedTotalFromGt = grandTotalRow[comparisonColumn]; 
                    const plannedTotal = typeof plannedTotalFromGt === 'number' ? plannedTotalFromGt : parseFloat(String(plannedTotalFromGt ?? '0').split(' ')[0]); 
                    
                    let actualTotal = 0;
                    let hasActualsForDiff = false;
                     data.forEach(dRow => {
                         if (dRow.note !== PIVOT_SUBTOTAL_MARKER) {
                            const rowContentKey = generateRowKey(dRow, columns, isComparisonMode, comparisonColumn);
                            const actualValStr = actualQuantities[`${rowContentKey}_${comparisonColumn}`];
                            if (actualValStr !== undefined && actualValStr !== '') {
                                const actualValNum = parseFloat(actualValStr);
                                if (!isNaN(actualValNum)) {
                                    actualTotal += actualValNum;
                                    hasActualsForDiff = true;
                                }
                            }
                         }
                    });
                    if (hasActualsForDiff && !isNaN(plannedTotal)) {
                        const diff = actualTotal - plannedTotal;
                        displayCellValue = parseFloat(diff.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) ;
                    } else {
                        displayCellValue = "";
                    }
                } else if (isComparisonMode && comparisonColumn && column === `Actual Received for Group (${comparisonColumn.replace(/_/g, ' ')})`) {
                    let totalGroupActual = 0;
                    let hasGroupActuals = false;
                     Object.entries(actualGroupQuantities).forEach(([key, valStr]) => {
                         if(key.endsWith(`_${comparisonColumn}`)){
                             const actualValNum = parseFloat(valStr);
                             if (!isNaN(actualValNum)) {
                                 totalGroupActual += actualValNum;
                                 hasGroupActuals = true;
                             }
                         }
                     });
                    displayCellValue = hasGroupActuals ? parseFloat(totalGroupActual.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : "";

                } else if (isComparisonMode && comparisonColumn && column === `Group Difference (${comparisonColumn.replace(/_/g, ' ')})`) {
                    const plannedTotalFromGt = grandTotalRow[comparisonColumn];
                    const plannedTotal = typeof plannedTotalFromGt === 'number' ? plannedTotalFromGt : parseFloat(String(plannedTotalFromGt ?? '0').split(' ')[0]);
                    
                    let actualTotalGroup = 0;
                    let hasActualsForGroupDiff = false;
                     Object.entries(actualGroupQuantities).forEach(([key, valStr]) => {
                         if(key.endsWith(`_${comparisonColumn}`)){
                             const actualValNum = parseFloat(valStr);
                             if (!isNaN(actualValNum)) {
                                 actualTotalGroup += actualValNum;
                                 hasActualsForGroupDiff = true;
                             }
                         }
                     });

                    if (hasActualsForGroupDiff && !isNaN(plannedTotal)) {
                        const diff = actualTotalGroup - plannedTotal;
                        displayCellValue = parseFloat(diff.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                    } else {
                        displayCellValue = "";
                    }
                }
                else { // Handles non-comparison mode and other columns in comparison mode
                    const rawCellValue = grandTotalRow[originalColumnName];
                    if (rawCellValue === PIVOT_BLANK_MARKER) {
                        displayCellValue = "";
                    } else if (colIndex === 0 && (rawCellValue === undefined || rawCellValue === null || String(rawCellValue).trim().toLowerCase() === "grand total")) {
                        if (grandTotalRow.note === "Grand Total" && String(grandTotalRow[originalColumnName] ?? '').toLowerCase() === "grand total"){
                             displayCellValue = "Grand Total";
                         } else if (grandTotalRow.note === "Grand Total" && (rawCellValue === undefined || rawCellValue === PIVOT_BLANK_MARKER || rawCellValue === null)){
                             displayCellValue = "Grand Total";
                         } else {
                             displayCellValue = String(rawCellValue ?? '');
                         }
                    } else if (!isComparisonMode && originalColumnName.startsWith('ingredient_qty_') && originalColumnName.endsWith('_sum') && typeof rawCellValue === 'number') {
                        // Grand Total UoM concatenation for View Data / Export Section
                        const uom = grandTotalRow[baseUomNameFirstKey]; 
                        if (uom && typeof uom === 'string' && uom.trim() !== '') {
                             displayCellValue = `${rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                        } else {
                             displayCellValue = rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                        }
                    } else if (isComparisonMode && originalColumnName === comparisonColumn && grandTotalRow.note === "Grand Total") {
                         // For comparison grand total, page.tsx formats this with UoM if numeric
                         displayCellValue = String(rawCellValue ?? '');
                    }
                    else if (typeof rawCellValue === 'number') {
                      const numVal = rawCellValue as number;
                      displayCellValue = numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                    } else if (rawCellValue === undefined || rawCellValue === null) {
                       displayCellValue = "";
                    } else {
                      displayCellValue = String(rawCellValue);
                    }
                }
                 const isNumericGTOutputCol = typeof grandTotalRow[originalColumnName] === 'number' || 
                                          (isComparisonMode && (column.startsWith("Actual ") || column.startsWith("Difference ") || column.startsWith("Actual Received for Group") || column.startsWith("Group Difference"))) ||
                                          (!isComparisonMode && originalColumnName.startsWith('ingredient_qty_') && originalColumnName.endsWith('_sum'));
                 return (
                    <TableCell key={column} className={`whitespace-nowrap ${isNumericGTOutputCol ? "text-right" : ""}`}>
                      {displayCellValue}
                    </TableCell>
                  );
              })}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <ScrollBar orientation="horizontal" />
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
};

export default DataTable;
