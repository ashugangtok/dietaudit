
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
// Removed Input as it's not used by this simplified DataTable for View/Export tabs
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { DietDataRow, GroupingOption } from '@/types';
import { PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER } from '@/types';

interface DataTableProps {
  data: DietDataRow[];
  columns: string[]; 
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
  // Props for comparison mode are removed as this DataTable will not be used for the new Comparison tab structure
  // isComparisonMode?: boolean; 
  // comparisonColumn?: string | null;
  // actualQuantities?: Record<string, string>; 
  // onActualQuantityChange?: (contentBasedKey: string, comparisonColumn: string, value: string) => void;
  groupingOptions: GroupingOption[]; 
  allHeaders: string[]; // Still needed for UOM logic in View Data / Export Section
}


const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
  groupingOptions = [], 
  allHeaders,
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
    // For "View Data" and "Export Section", useTableProcessor has already filtered out 'base_uom_name_first' 
    // if it was only for internal UOM processing. If it's meant to be displayed (e.g. user added it as summary), it will be here.
    // This DataTable will handle combining UOM with qty for display if `base_uom_name_first` is present on the row data.
    return columns.filter(col => col !== 'note' && !col.endsWith('base_uom_name_first')); // Explicitly hide UOM column if it accidentally passes through
  }, [columns]);

  if (!data.length && !grandTotalRow) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }
  
  const dietNameColumnKey = 'diet_name'; 
  // Key for UOM on row data, typically 'base_uom_name_first' if summarized by useTableProcessor
  const uomRowDataKey = allHeaders.includes('base_uom_name') ? defaultSummaries.find(s => s.column === 'base_uom_name' && s.type === 'first')?.name || 'base_uom_name_first' : undefined;
  // Access global defaultSummaries to find the UOM key name
  const defaultSummaries = DEFAULT_IMAGE_PIVOT_SUMMARIES; // Assuming this is accessible or passed if needed for dynamic UOM key
  

  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {effectiveDisplayColumns.map((column) => {
              let headerText = column;
               if (column.startsWith('total_animal_')) { // Handles total_animal_sum, total_animal_average etc.
                 headerText = 'Total Animal';
               } else {
                 // General beautification: remove summary type suffix, replace underscores, capitalize
                 headerText = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '')
                                  .replace(/_/g, ' ')
                                  .split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');
                // Optionally add back a simplified suffix for clarity if needed by users
                 if (column.endsWith('_sum')) headerText += ""; // Already implied by context for ingredient_qty
                 else if (column.endsWith('_average')) headerText += " (Avg)";
                 else if (column.endsWith('_count')) headerText += " (Count)";
                 // else if (column.endsWith('_first')) headerText += " (First)"; // Often not needed for header
                 // else if (column.endsWith('_max')) headerText += " (Max)";
               }
              return (<TableHead key={column} className="font-semibold whitespace-nowrap">{headerText}</TableHead>);
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => {
            const rowKey = `datarow-${rowIndex}-${JSON.stringify(Object.values(row).join('-'))}`; 
            return (
              <TableRow
                  key={rowKey}
                  className={row.note === PIVOT_SUBTOTAL_MARKER ? "bg-secondary/70 font-semibold" : ""}
                  data-testid={`data-row-${rowIndex}`}
              >
                {effectiveDisplayColumns.map((column) => {
                  let cellContent: React.ReactNode;
                  const cellValue = row[column];

                  // UOM Concatenation for 'ingredient_qty_sum' (or similar qty columns)
                  if (column.startsWith('ingredient_qty_') && column.endsWith('_sum') && uomRowDataKey && row[uomRowDataKey]) {
                      const qtyValue = cellValue;
                      const uom = row[uomRowDataKey];
                      if (typeof qtyValue === 'number' && typeof uom === 'string' && uom.trim() !== '') {
                          cellContent = `${qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                      } else if (typeof qtyValue === 'number') { // Fallback if no UOM
                          cellContent = qtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                      } else { // Non-numeric or blank
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

                  if (column === dietNameColumnKey && typeof cellContent === 'string' && cellContent.includes('\n')) {
                    return (
                      <TableCell key={column} className="whitespace-nowrap">
                        <div style={{ whiteSpace: 'pre' }}>{cellContent}</div>
                      </TableCell>
                    );
                  }
                  
                  const isNumericOutputCol = typeof row[column] === 'number' || 
                                          (column.startsWith('ingredient_qty_') && column.endsWith('_sum'));
                                          
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
                    const uom = grandTotalRow[uomRowDataKey]; // UOM from grand total row itself
                    if (uom && typeof uom === 'string' && uom.trim() !== '') {
                         displayCellValue = `${rawCellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                    } else { // Fallback if no UOM on grand total
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
                
                 const isNumericGTOutputCol = typeof grandTotalRow[column] === 'number' || 
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

// Need to make DEFAULT_IMAGE_PIVOT_SUMMARIES accessible here for uomRowDataKey logic
// This is a bit of a workaround; ideally, this info would be passed or determined more cleanly.
const DEFAULT_IMAGE_PIVOT_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'sum' },
  { column: 'base_uom_name', type: 'first' }, // Ensure this is part of defaults if auto-UOM is desired
  { column: 'total_animal', type: 'sum' },
];


export default DataTable;

