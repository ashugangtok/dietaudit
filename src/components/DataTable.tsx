
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
import type { DietDataRow, GroupingOption, SummarizationOption } from '@/types';
import { PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER, DEFAULT_IMAGE_PIVOT_SUMMARIES } from '@/types';

interface DataTableProps {
  data: DietDataRow[];
  columns: string[]; 
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
  allHeaders: string[]; 
}


const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  grandTotalRow,
  isLoading,
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

  const uomSummaryConfig = useMemo(() => {
    return DEFAULT_IMAGE_PIVOT_SUMMARIES.find(s => s.column === 'base_uom_name' && s.type === 'first');
  }, []);
  const uomRowDataKey = uomSummaryConfig ? `${uomSummaryConfig.column}_${uomSummaryConfig.type}` : 'base_uom_name_first';


  const effectiveDisplayColumns = useMemo(() => {
    // Hide the UoM column if it exists as a separate summarized column, as it will be combined
    return columns.filter(col => col !== uomRowDataKey);
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
               if (column.startsWith('total_animal_')) { 
                 headerText = 'Total Animal';
               } else {
                 headerText = column.replace(/_sum$|_average$|_count$|_first$|_max$/i, '')
                                  .replace(/_/g, ' ')
                                  .split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');
                if (column.endsWith('_sum')) headerText += ""; 
                 else if (column.endsWith('_average')) headerText += " (Avg)";
                 else if (column.endsWith('_count')) headerText += " (Count)";
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

                  if (column.startsWith('ingredient_qty_') && column.endsWith('_sum') && allHeaders.includes('base_uom_name') && row[uomRowDataKey]) {
                      const qtyValue = cellValue;
                      const uom = row[uomRowDataKey];
                      if (typeof qtyValue === 'number' && typeof uom === 'string' && uom.trim() !== '') {
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
                } else if (column.startsWith('ingredient_qty_') && column.endsWith('_sum') && allHeaders.includes('base_uom_name') && grandTotalRow[uomRowDataKey] && typeof rawCellValue === 'number') {
                    const uom = grandTotalRow[uomRowDataKey]; 
                    if (uom && typeof uom === 'string' && uom.trim() !== '') {
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


export default DataTable;

