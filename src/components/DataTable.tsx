
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
import type { DietDataRow } from '@/types';
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
  groupingColumns?: string[];
}

const generateRowKey = (row: DietDataRow, allRelevantColumns: string[]): string => {
  const keyValues: string[] = [];
  for (const col of allRelevantColumns) {
    if (col.startsWith("Actual ") || col.startsWith("Difference ") || col === 'note') {
      continue;
    }
    const val = row[col];
    if (val === PIVOT_BLANK_MARKER) {
      keyValues.push(PIVOT_BLANK_MARKER);
    } else if (val === undefined || val === null) {
      keyValues.push("___NULL_OR_UNDEFINED___");
    } else {
      keyValues.push(String(val));
    }
  }
  return keyValues.join('||');
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
  groupingColumns = []
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
    let colsToDisplay = [...columns];
    if (isComparisonMode && comparisonColumn && columns.includes(comparisonColumn)) {
      const plannedColIndex = colsToDisplay.indexOf(comparisonColumn);
      if (plannedColIndex !== -1) {
        colsToDisplay.splice(plannedColIndex + 1, 0, `Actual ${comparisonColumn}`, `Difference ${comparisonColumn}`);
      }
    }
    colsToDisplay = colsToDisplay.filter(col => col !== 'note' && col !== 'base_uom_name_first');
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
  const ingredientQtySumKey = columns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum')) || 'ingredient_qty_sum'; // Fallback
  const baseUomNameFirstKey = 'base_uom_name_first';


  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview {isComparisonMode ? "(Comparison Mode)" : ""}</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column.replace(/_/g, ' ');
              if (column.startsWith('total_animal_')) {
                 headerText = 'Total Animal';
              }
              headerText = headerText.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
              
              return (<TableHead key={column} className="font-semibold whitespace-nowrap">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            const contentBasedKey = generateRowKey(row, columns); 
            const tableRowReactKey = `${contentBasedKey}_react_map_${rowIndex}`;

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
                        disabled={row.note === PIVOT_SUBTOTAL_MARKER}
                      />
                    );
                  } else if (isComparisonMode && comparisonColumn && column === `Difference ${comparisonColumn}`) {
                    const plannedValueStr = String(row[comparisonColumn] ?? '0'); // Comparison tab value is already formatted "Qty UOM"
                    const plannedValue = parseFloat(plannedValueStr); 
                    const actualValueStr = actualQuantities[`${contentBasedKey}_${comparisonColumn}`] || '';
                    const actualValue = parseFloat(actualValueStr);
                    let difference: string | number = '';
                    let differenceStyle: React.CSSProperties = {};

                    if (actualValueStr !== '' && !isNaN(actualValue) && !isNaN(plannedValue)) {
                      const diffNum = actualValue - plannedValue;
                      difference = parseFloat(diffNum.toFixed(4));
                      if (diffNum > 0) differenceStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' };
                      if (diffNum < 0) differenceStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' };
                    }
                     cellContent = <span style={differenceStyle}>{typeof difference === 'number' ? difference.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : difference}</span>;
                  } else {
                    const cellValue = row[originalColumnName];
                    if (cellValue === PIVOT_BLANK_MARKER) {
                      cellContent = '';
                    } else if (!isComparisonMode && originalColumnName === ingredientQtySumKey && typeof cellValue === 'number') {
                        // For View Data / Export Section tabs: combine numeric qty with UoM from row object
                        const uom = row[baseUomNameFirstKey];
                        if (uom && typeof uom === 'string' && uom.trim() !== '') {
                            cellContent = `${cellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                        } else {
                            cellContent = cellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                        }
                    } else if (typeof cellValue === 'number') {
                      cellContent = Number.isInteger(cellValue) ? String(cellValue) : cellValue.toFixed(2);
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

                  return (
                    <TableCell key={column} className={`whitespace-nowrap ${ (column.startsWith("Actual ") || column.startsWith("Difference ")) ? "text-right" : ""}`}>
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
                            const rowContentKey = generateRowKey(dRow, columns);
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
                    const plannedTotalFromGt = grandTotalRow[comparisonColumn]; // This is numeric from page.tsx for comparison GT
                    const plannedTotal = typeof plannedTotalFromGt === 'number' ? plannedTotalFromGt : parseFloat(String(plannedTotalFromGt ?? '0'));
                    
                    let actualTotal = 0;
                    let hasActualsForDiff = false;
                     data.forEach(dRow => {
                         if (dRow.note !== PIVOT_SUBTOTAL_MARKER) {
                            const rowContentKey = generateRowKey(dRow, columns);
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
                } else {
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
                    } else if (!isComparisonMode && originalColumnName === ingredientQtySumKey && typeof rawCellValue === 'number') {
                        // For View Data / Export Section tabs Grand Total: combine numeric qty with UoM
                        const uom = grandTotalRow[baseUomNameFirstKey]; // UoM might not be meaningful for GT, but attempt
                        if (uom && typeof uom === 'string' && uom.trim() !== '') {
                             displayCellValue = `${rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                        } else {
                             displayCellValue = rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                        }
                    } else if (typeof rawCellValue === 'number') {
                      const numVal = rawCellValue as number;
                      displayCellValue = numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                    } else if (rawCellValue === undefined || rawCellValue === null) {
                       displayCellValue = "";
                    } else {
                      displayCellValue = String(rawCellValue);
                    }
                }
                 return (
                    <TableCell key={column} className={`whitespace-nowrap ${ (column.startsWith("Actual ") || column.startsWith("Difference ")) ? "text-right" : ""}`}>
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

