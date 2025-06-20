
"use client";

import type React from 'react';
import { Fragment, useMemo } from 'react';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { DietDataRow } from '@/types';
import { PIVOT_BLANK_MARKER } from '@/types';

interface DataTableProps {
  data: DietDataRow[];
  columns: string[];
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
  allHeaders: string[];
  isViewDataTab?: boolean; // Flag to enable two-row display
}


const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
  allHeaders,
  isViewDataTab = false, // Default to false
}) => {
  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  const dietNameColumnKey = 'diet_name'; 
  
  const uomRowDataKey = useMemo(() => {
    if (allHeaders.includes('base_uom_name')) {
      return columns.find(col => col.startsWith('base_uom_name_') && col.endsWith('_first'));
    }
    return undefined;
  }, [columns, allHeaders]);

  const ingredientQtySumKey = useMemo(() => {
    return columns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum'));
  }, [columns]);

  const totalAnimalFirstKey = useMemo(() => {
    return columns.find(col => col.startsWith('total_animal_') && col.endsWith('_first'));
  }, [columns]);


  const effectiveDisplayColumns = useMemo(() => {
    if (uomRowDataKey && ingredientQtySumKey && uomRowDataKey !== ingredientQtySumKey) {
      return columns.filter(col => col !== uomRowDataKey);
    }
    return columns;
  }, [columns, uomRowDataKey, ingredientQtySumKey]);

  if (!data.length && !grandTotalRow) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }

  const grandTotalRequiredQty = useMemo(() => {
    if (!isViewDataTab || !grandTotalRow || !ingredientQtySumKey || !totalAnimalFirstKey) return 0;
    return data.reduce((sum, row) => {
      const perAnimalQty = Number(row[ingredientQtySumKey] || 0);
      const animalCount = Number(row[totalAnimalFirstKey] || 0);
      return sum + (perAnimalQty * animalCount);
    }, 0);
  }, [data, grandTotalRow, ingredientQtySumKey, totalAnimalFirstKey, isViewDataTab]);


  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column;
               if (column.startsWith('total_animal_')) {
                 headerText = 'Animal Count'; // Changed for clarity
               } else if (column.startsWith('ingredient_qty_') && column.endsWith('_sum')) {
                 headerText = 'Ingredient Qty'; // Simplified for View Data two-row display
               } else if (column.startsWith('base_uom_name_') && column.endsWith('_first')) {
                 headerText = 'UoM'; 
               }
               else {
                 headerText = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '')
                                  .replace(/_/g, ' ')
                                  .split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');
               }
              return (<TableHead key={column} className="font-semibold whitespace-nowrap">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            const perAnimalRowKey = `datarow-${rowIndex}-per-animal-${JSON.stringify(Object.values(row).slice(0, 5).join('-'))}`;
            const totalRequiredRowKey = `datarow-${rowIndex}-total-required-${JSON.stringify(Object.values(row).slice(0, 5).join('-'))}`;
            
            let totalRequiredQtyForThisIngredient: number | string = '';
            if (isViewDataTab && ingredientQtySumKey && totalAnimalFirstKey && row[ingredientQtySumKey] !== undefined && row[totalAnimalFirstKey] !== undefined) {
                 const perAnimal = Number(row[ingredientQtySumKey]);
                 const animalCount = Number(row[totalAnimalFirstKey]);
                 if (!isNaN(perAnimal) && !isNaN(animalCount)) {
                    totalRequiredQtyForThisIngredient = perAnimal * animalCount;
                 }
            }


            return (
              <Fragment key={`fragment-${rowIndex}`}>
                {/* Row 1: Per Animal Quantity */}
                <TableRow
                    key={perAnimalRowKey}
                    className={row.note === PIVOT_BLANK_MARKER ? "bg-secondary/70 font-semibold" : ""}
                    data-testid={`data-row-${rowIndex}-per-animal`}
                >
                  {effectiveDisplayColumns.map((column) => {
                    let cellContent: React.ReactNode;
                    const cellValue = row[column];

                    if (column === ingredientQtySumKey && uomRowDataKey && row[uomRowDataKey]) {
                        const qtyValue = cellValue;
                        const uom = row[uomRowDataKey]; 
                        if (typeof qtyValue === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                            cellContent = `${qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                        } else if (typeof qtyValue === 'number') { 
                            cellContent = qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                        } else { 
                            cellContent = (qtyValue === undefined || qtyValue === null || qtyValue === PIVOT_BLANK_MARKER ? '' : String(qtyValue));
                        }
                    } else if (cellValue === PIVOT_BLANK_MARKER) {
                      cellContent = '';
                    } else if (typeof cellValue === 'number') {
                      cellContent = Number.isInteger(cellValue) && !String(cellValue).includes('.') 
                                      ? String(cellValue)
                                      : cellValue.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
                    } else {
                      cellContent = (cellValue === undefined || cellValue === null ? '' : String(cellValue));
                    }

                    if (column === dietNameColumnKey && typeof cellContent === 'string' && (cellContent.includes('\n') || (row.note === PIVOT_BLANK_MARKER && String(row[column]).includes('Species')))) {
                      return (
                        <TableCell key={`${column}-per-animal`} className="whitespace-nowrap">
                          <div style={{ whiteSpace: 'pre-wrap' }}>{cellContent}</div>
                        </TableCell>
                      );
                    }

                    const originalColumnName = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '');
                    const isPotentiallyNumeric = allHeaders.includes(originalColumnName) && 
                                                 !['site_name', 'section_name', 'group_name', 'common_name', 'meal_time', 'ingredient_name', 'diet_name', 'type_name', 'base_uom_name'].includes(originalColumnName);
                    const isNumericOutputCol = (typeof row[column] === 'number' && column !== uomRowDataKey) || 
                                            (column === ingredientQtySumKey && typeof row[column] === 'number') || 
                                            (isPotentiallyNumeric && typeof row[column] === 'number');

                    return (
                      <TableCell key={`${column}-per-animal`} className={`whitespace-nowrap ${isNumericOutputCol ? "text-right" : "text-left"}`}>
                        {cellContent}
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Row 2: Total Quantity Required (only for View Data tab) */}
                {isViewDataTab && ingredientQtySumKey && totalAnimalFirstKey && (
                  <TableRow
                      key={totalRequiredRowKey}
                      className="bg-muted/30"
                      data-testid={`data-row-${rowIndex}-total-required`}
                  >
                    {effectiveDisplayColumns.map((column, colIndex) => {
                      let cellContentTotal: React.ReactNode = PIVOT_BLANK_MARKER;
                      let isNumericOutputColTotal = false;

                      const isGroupingColumn = !column.match(/_sum$|_average$|_count$|_first$|_max$/i);

                      if (colIndex === effectiveDisplayColumns.findIndex(c => c.startsWith('ingredient_name'))) { // Assuming ingredient_name is the most specific field shown before qty. Adjust if needed.
                           cellContentTotal = (
                            <span style={{ paddingLeft: '1.5rem' }}>
                               ↳ Total Required
                            </span>);
                      } else if (column === ingredientQtySumKey) {
                          const qtyVal = totalRequiredQtyForThisIngredient;
                          if (uomRowDataKey && row[uomRowDataKey] && typeof qtyVal === 'number') {
                              const uom = row[uomRowDataKey];
                              if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                                  cellContentTotal = `${qtyVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                              } else {
                                  cellContentTotal = qtyVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                              }
                          } else if (typeof qtyVal === 'number') {
                              cellContentTotal = qtyVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                          } else {
                              cellContentTotal = String(qtyVal);
                          }
                          isNumericOutputColTotal = true;
                      } else if (isGroupingColumn) {
                          cellContentTotal = PIVOT_BLANK_MARKER;
                      } else { // Other summary columns like animal_count or UoM in this row
                          cellContentTotal = PIVOT_BLANK_MARKER;
                      }
                      
                      if(cellContentTotal === PIVOT_BLANK_MARKER) cellContentTotal = '';


                      return (
                        <TableCell key={`${column}-total`} className={`whitespace-nowrap ${isNumericOutputColTotal ? "text-right" : "text-left"}`}>
                          {cellContentTotal}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
        {grandTotalRow && (
          <TableFooter className="sticky bottom-0 bg-secondary font-bold z-10 shadow-sm">
            {/* Grand Total Row 1: Per Animal */}
            <TableRow data-testid="grand-total-row-per-animal">
              {effectiveDisplayColumns.map((column, colIndex) => {
                let displayCellValue: React.ReactNode = "";
                const rawCellValue = grandTotalRow[column];

                if (colIndex === 0 && (rawCellValue === undefined || rawCellValue === null || String(rawCellValue).trim().toLowerCase() === "grand total" || grandTotalRow.note === "Grand Total")) {
                     displayCellValue = isViewDataTab ? "Grand Total (Per Animal)" : "Grand Total";
                } else if (column === ingredientQtySumKey && uomRowDataKey && grandTotalRow[uomRowDataKey] && typeof rawCellValue === 'number') {
                    const uom = grandTotalRow[uomRowDataKey];
                    if (uom && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                         displayCellValue = `${rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                    } else { 
                         displayCellValue = rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                    }
                } else if (rawCellValue === PIVOT_BLANK_MARKER) {
                    displayCellValue = "";
                } else if (typeof rawCellValue === 'number') {
                  const numVal = rawCellValue as number;
                  displayCellValue = numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                } else if (rawCellValue === undefined || rawCellValue === null) {
                   displayCellValue = "";
                } else {
                  displayCellValue = String(rawCellValue);
                }

                 const originalColumnNameGT = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '');
                 const isPotentiallyNumericGT = allHeaders.includes(originalColumnNameGT) &&
                                             !['site_name', 'section_name', 'group_name', 'common_name', 'meal_time', 'ingredient_name', 'diet_name', 'type_name', 'base_uom_name'].includes(originalColumnNameGT);
                 const isNumericGTOutputCol = (typeof grandTotalRow[column] === 'number' && column !== uomRowDataKey) ||
                                          (column === ingredientQtySumKey && typeof grandTotalRow[column] === 'number') ||
                                          (isPotentiallyNumericGT && typeof grandTotalRow[column] === 'number');
                 return (
                    <TableCell key={`${column}-gt-per-animal`} className={`whitespace-nowrap ${isNumericGTOutputCol ? "text-right" : "text-left"}`}>
                      {displayCellValue}
                    </TableCell>
                  );
              })}
            </TableRow>
            
            {/* Grand Total Row 2: Total Required (only for View Data tab) */}
            {isViewDataTab && ingredientQtySumKey && totalAnimalFirstKey && (
                 <TableRow data-testid="grand-total-row-total-required" className="bg-secondary/70">
                    {effectiveDisplayColumns.map((column, colIndex) => {
                        let displayCellValueTotal: React.ReactNode = "";
                        let isNumericOutputColTotalGT = false;

                        if (colIndex === 0) {
                            displayCellValueTotal = "Grand Total (Total Required)";
                        } else if (column === ingredientQtySumKey) {
                            const uomForGrandTotalRequired = uomRowDataKey ? grandTotalRow[uomRowDataKey] : undefined;
                            if (uomForGrandTotalRequired && typeof uomForGrandTotalRequired === 'string' && uomForGrandTotalRequired.trim() !== '' && uomForGrandTotalRequired !== PIVOT_BLANK_MARKER) {
                                displayCellValueTotal = `${grandTotalRequiredQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uomForGrandTotalRequired.trim()}`;
                            } else {
                                displayCellValueTotal = grandTotalRequiredQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                            }
                            isNumericOutputColTotalGT = true;
                        } else {
                            displayCellValueTotal = PIVOT_BLANK_MARKER;
                        }
                        
                        if(displayCellValueTotal === PIVOT_BLANK_MARKER) displayCellValueTotal = '';

                        return (
                            <TableCell key={`${column}-gt-total`} className={`whitespace-nowrap ${isNumericOutputColTotalGT ? "text-right" : "text-left"}`}>
                            {displayCellValueTotal}
                            </TableCell>
                        );
                    })}
                 </TableRow>
            )}
          </TableFooter>
        )}
      </Table>
      <ScrollBar orientation="horizontal" />
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
};


export default DataTable;

