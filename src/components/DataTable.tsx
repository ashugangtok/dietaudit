
"use client";

import type React from 'react';
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
import { PIVOT_BLANK_MARKER, PIVOT_SUBTOTAL_MARKER } from '@/types';

interface DataTableProps {
  data: DietDataRow[];
  columns: string[];
  grandTotalRow?: DietDataRow;
  isLoading?: boolean;
}

const DataTable: React.FC<DataTableProps> = ({ data, columns, grandTotalRow, isLoading }) => {
  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  if (!data.length && !grandTotalRow) {
    return (
      <div className="text-center p-8 border rounded-lg shadow-sm bg-card">
        <p className="text-muted-foreground">No data to display. Upload a file or adjust filters.</p>
      </div>
    );
  }
  
  const displayColumns = columns.filter(col => col !== 'note');

  return (
    <ScrollArea className="whitespace-nowrap rounded-md border h-full">
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
          <TableRow>
            {displayColumns.map((column) => (
              <TableHead key={column} className="font-semibold whitespace-nowrap">{column.replace(/_/g, ' ')}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => (
            <TableRow 
                key={rowIndex} 
                className={row.note === PIVOT_SUBTOTAL_MARKER ? "bg-secondary/70 font-semibold" : ""}
                data-testid={`data-row-${rowIndex}`}
            >
              {displayColumns.map((column) => {
                let cellContent;
                const cellValue = row[column];

                if (cellValue === PIVOT_BLANK_MARKER) {
                  cellContent = '';
                } else if (typeof cellValue === 'number') {
                  // Format numbers to 2 decimal places if they are not integers
                  cellContent = Number.isInteger(cellValue) ? String(cellValue) : cellValue.toFixed(2);
                } else {
                  cellContent = (cellValue === undefined || cellValue === null ? '' : String(cellValue));
                }
                return (
                  <TableCell key={column} className="whitespace-nowrap">
                    {cellContent}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        {grandTotalRow && (
          <TableFooter className="sticky bottom-0 bg-secondary font-bold z-10 shadow-sm">
            <TableRow data-testid="grand-total-row">
              {displayColumns.map((column, colIndex) => {
                const rawCellValue = grandTotalRow[column];
                let displayCellValue;

                if (colIndex === 0 && (rawCellValue === undefined || rawCellValue === PIVOT_BLANK_MARKER || rawCellValue === null)) {
                  displayCellValue = "Grand Total";
                } else if (rawCellValue === PIVOT_BLANK_MARKER) {
                  displayCellValue = ""; 
                } else if (typeof rawCellValue === 'number') {
                  const numVal = rawCellValue as number;
                  displayCellValue = Number.isInteger(numVal) ? String(numVal) : numVal.toFixed(2);
                } else if (rawCellValue === undefined || rawCellValue === null) {
                   displayCellValue = "";
                } else {
                  displayCellValue = String(rawCellValue);
                }

                 return (
                    <TableCell key={column} className="whitespace-nowrap">
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
