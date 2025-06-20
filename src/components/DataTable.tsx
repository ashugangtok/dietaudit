
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { DietDataRow } from '@/types';
import { PIVOT_BLANK_MARKER, DEFAULT_IMAGE_PIVOT_SUMMARIES } from '@/types'; // Added DEFAULT_IMAGE_PIVOT_SUMMARIES

interface DataTableProps {
  data: DietDataRow[];
  columns: string[]; 
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
  allHeaders: string[]; // Added allHeaders to help find UoM column
}


const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
  allHeaders, // Destructure allHeaders
}) => {
  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  // Determine the key for UoM data on row objects, typically 'base_uom_name_first'
  // This depends on how summaries are configured in page.tsx (should include base_uom_name_first for UoM display)
  const uomSummaryConfig = useMemo(() => {
    // Check if base_uom_name is part of the original headers to ensure it's a valid column to summarize
    if (allHeaders.includes('base_uom_name')) {
        // This attempts to find how 'base_uom_name' was summarized.
        // For default view, page.tsx ensures `base_uom_name_first` is part of defaultSummaries.
        // It's safer to rely on a consistent naming convention like `base_uom_name_first`.
        return DEFAULT_IMAGE_PIVOT_SUMMARIES.find(s => s.column === 'base_uom_name' && s.type === 'first') || 
               { name: 'base_uom_name_first', column: 'base_uom_name', type: 'first' }; // Fallback to expected name
    }
    return undefined;
  }, [allHeaders]);

  const uomRowDataKey = uomSummaryConfig ? `${uomSummaryConfig.column}_${uomSummaryConfig.type}` : undefined;


  const effectiveDisplayColumns = useMemo(() => {
    // Hide the UoM column if it exists as a separate summarized column AND it's not the ingredient_qty_sum itself
    if (uomRowDataKey && columns.includes(uomRowDataKey) && !uomRowDataKey.startsWith('ingredient_qty_')) {
      return columns.filter(col => col !== uomRowDataKey);
    }
    return columns;
  }, [columns, uomRowDataKey]);

  if (!data.length && !grandTotalRow) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }
  
  const dietNameColumnKey = 'diet_name'; 
  
  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column;
               // Specific header transformations based on column name patterns
               if (column.startsWith('total_animal_')) { // Covers total_animal_sum, total_animal_first etc.
                 headerText = 'Total Animal';
               } else if (column.startsWith('ingredient_qty_') && column.endsWith('_sum')) {
                 headerText = 'Ingredient Qty (Sum)';
               } else { // General transformation for other columns
                 headerText = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '')
                                  .replace(/_/g, ' ')
                                  .split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');
                // Add specific suffixes if needed, though they are often removed by the replace regex above
                // if (column.endsWith('_sum')) headerText += " (Sum)"; // Already handled by "Ingredient Qty (Sum)"
                 if (column.endsWith('_average')) headerText += " (Avg)";
                 else if (column.endsWith('_count')) headerText += " (Count)";
                 // else if (column.endsWith('_first')) headerText += " (First)"; // Often not needed for header display
                 // else if (column.endsWith('_max')) headerText += " (Max)";
               }
              return (<TableHead key={column} className="font-semibold whitespace-nowrap">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            // Ensure a unique key for each row, especially if content can be similar
            const rowKey = `datarow-${rowIndex}-${JSON.stringify(Object.values(row).slice(0, 5).join('-'))}`; 
            return (
              <TableRow
                  key={rowKey}
                  className={row.note === PIVOT_SUBTOTAL_MARKER ? "bg-secondary/70 font-semibold" : ""}
                  data-testid={`data-row-${rowIndex}`}
              >
                {effectiveDisplayColumns.map((column) => {
                  let cellContent: React.ReactNode;
                  const cellValue = row[column];

                  // UoM Concatenation for ingredient_qty_sum
                  if (column.startsWith('ingredient_qty_') && column.endsWith('_sum') && uomRowDataKey && row[uomRowDataKey]) {
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

                  // Special handling for diet_name to preserve newlines for species list
                  if (column === dietNameColumnKey && typeof cellContent === 'string' && cellContent.includes('\n')) {
                    return (
                      <TableCell key={column} className="whitespace-nowrap">
                        <div style={{ whiteSpace: 'pre-wrap' }}>{cellContent}</div> {/* Use pre-wrap */}
                      </TableCell>
                    );
                  }
                  
                  // Determine if the column (after UoM concat) primarily displays numeric data
                  const isNumericOutputCol = (typeof row[column] === 'number' && !(column.startsWith('ingredient_qty_') && column.endsWith('_sum'))) || 
                                          (column.startsWith('ingredient_qty_') && column.endsWith('_sum')); // Ingredient Qty (Sum) with UOM is still right-aligned
                                          
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
                let displayCellValue: React.ReactNode = "";
                const rawCellValue = grandTotalRow[column];

                if (colIndex === 0 && (rawCellValue === undefined || rawCellValue === null || String(rawCellValue).trim().toLowerCase() === "grand total" || grandTotalRow.note === "Grand Total")) {
                     displayCellValue = "Grand Total";
                } else if (column.startsWith('ingredient_qty_') && column.endsWith('_sum') && uomRowDataKey && grandTotalRow[uomRowDataKey] && typeof rawCellValue === 'number') {
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
                
                 const isNumericGTOutputCol = (typeof grandTotalRow[column] === 'number' && !(column.startsWith('ingredient_qty_') && column.endsWith('_sum'))) ||
                                          (column.startsWith('ingredient_qty_') && column.endsWith('_sum'));

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

