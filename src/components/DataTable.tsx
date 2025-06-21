
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
  isViewDataTab?: boolean; 
}

const getAbbreviatedUom = (uom: string): string => {
  if (!uom) return '';
  const lowerUom = uom.toLowerCase().trim();
  if (lowerUom === 'kilogram' || lowerUom === 'kilograms') return 'kg';
  if (lowerUom === 'piece' || lowerUom === 'pieces') return 'pcs';
  return uom.trim();
};

const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
  allHeaders,
  isViewDataTab = false, 
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

  const ingredientQtyFirstKey = useMemo(() => { 
    return columns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_first'));
  }, [columns]);

  const totalAnimalFirstKey = useMemo(() => {
    return columns.find(col => col.startsWith('total_animal_') && col.endsWith('_first'));
  }, [columns]);
  
  const totalQtyRequiredCalculatedColKey = 'total_qty_required_calculated';


  const effectiveDisplayColumns = useMemo(() => {
    let displayCols = [...columns];
    
    const qtyColumns = [ingredientQtyFirstKey, totalQtyRequiredCalculatedColKey, 'total_qty_required_sum'];
    const hasAnyQtyCol = qtyColumns.some(key => key && columns.includes(key));
    
    if (uomRowDataKey && hasAnyQtyCol) {
        displayCols = displayCols.filter(col => col !== uomRowDataKey);
    }
    
    if (isViewDataTab && totalAnimalFirstKey && columns.includes(totalAnimalFirstKey)) {
        displayCols = displayCols.filter(col => col !== totalAnimalFirstKey);
    }
    return displayCols;
  }, [columns, uomRowDataKey, ingredientQtyFirstKey, totalAnimalFirstKey, isViewDataTab, totalQtyRequiredCalculatedColKey]);

  if (!data.length && !grandTotalRow) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }


  return (
    <ScrollArea className="rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column;
               if (column === 'total_qty_required_sum') {
                 headerText = 'Total';
               } else if (column === totalAnimalFirstKey) { 
                 headerText = 'Animal Count'; 
               } else if (column === ingredientQtyFirstKey) {
                 headerText = 'Qty/Animal'; 
               } else if (column === totalQtyRequiredCalculatedColKey) {
                 headerText = 'Total Qty Required';
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
              return (<TableHead key={column} className="font-semibold">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            const rowKey = `datarow-${rowIndex}-${JSON.stringify(Object.values(row).slice(0, 5).join('-'))}`;
            
            return (
              <TableRow
                  key={rowKey}
                  className={row.note === PIVOT_BLANK_MARKER ? "bg-secondary/70 font-semibold" : ""}
                  data-testid={`data-row-${rowIndex}`}
              >
                {effectiveDisplayColumns.map((column) => {
                  let cellContent: React.ReactNode;
                  const cellValue = row[column];
                  const isQtyColumn = [ingredientQtyFirstKey, totalQtyRequiredCalculatedColKey, 'total_qty_required_sum'].includes(column);

                  if (isQtyColumn && uomRowDataKey && row[uomRowDataKey]) {
                      const qtyValue = cellValue;
                      const uom = row[uomRowDataKey]; 
                      const abbreviatedUom = getAbbreviatedUom(String(uom));
                      if (typeof qtyValue === 'number' && abbreviatedUom) {
                          cellContent = `${qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${abbreviatedUom}`;
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

                  const originalColumnName = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '');
                  const isPotentiallyNumeric = allHeaders.includes(originalColumnName) && 
                                               !['site_name', 'section_name', 'group_name', 'common_name', 'meal_time', 'ingredient_name', 'diet_name', 'type_name', 'base_uom_name'].includes(originalColumnName);
                  
                  const isNumericOutputCol = (typeof row[column] === 'number' && column !== uomRowDataKey) || 
                                          (isQtyColumn && typeof row[column] === 'number') ||
                                          (isPotentiallyNumeric && typeof row[column] === 'number');


                  if (column === dietNameColumnKey && typeof cellContent === 'string' && (cellContent.includes('\n') || (row.note === PIVOT_BLANK_MARKER && String(row[column]).includes('Species')))) {
                    return (
                      <TableCell key={`${column}-cell`} className={`${isNumericOutputCol ? "text-right" : "text-left"}`}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{cellContent}</div>
                      </TableCell>
                    );
                  }
                  
                  return (
                    <TableCell key={`${column}-cell`} className={`${isNumericOutputCol ? "text-right" : "text-left"}`}>
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
                let displayCellValue: React.ReactNode = "";
                const rawCellValue = grandTotalRow[column];
                const isQtyColumn = [ingredientQtyFirstKey, totalQtyRequiredCalculatedColKey, 'total_qty_required_sum'].includes(column);


                if (colIndex === 0 && (rawCellValue === undefined || rawCellValue === null || String(rawCellValue).trim().toLowerCase() === "grand total" || grandTotalRow.note === "Grand Total")) {
                     displayCellValue = "Grand Total";
                } else if (isQtyColumn && uomRowDataKey && grandTotalRow[uomRowDataKey] && typeof rawCellValue === 'number') {
                    const uom = grandTotalRow[uomRowDataKey];
                    const abbreviatedUom = getAbbreviatedUom(String(uom));
                    if (abbreviatedUom) {
                         displayCellValue = `${rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${abbreviatedUom}`;
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
                                          (isQtyColumn && typeof grandTotalRow[column] === 'number') ||
                                          (isPotentiallyNumericGT && typeof grandTotalRow[column] === 'number');
                 
                 if (column === dietNameColumnKey && typeof displayCellValue === 'string' && displayCellValue.includes('\n')) {
                    return (
                        <TableCell key={`${column}-gt`} className={`${isNumericGTOutputCol ? "text-right" : "text-left"}`}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{displayCellValue}</div>
                        </TableCell>
                    );
                 }

                 return (
                    <TableCell key={`${column}-gt`} className={`${isNumericGTOutputCol ? "text-right" : "text-left"}`}>
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
