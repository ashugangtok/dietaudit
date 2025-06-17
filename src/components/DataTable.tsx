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
  
  const displayColumns = columns.filter(col => col !== 'note'); // Exclude 'note' from header

  return (
    <ScrollArea className="whitespace-nowrap rounded-md border" style={{ maxHeight: '600px', overflow: 'auto' }}>
      <Table className="min-w-full">
        <TableCaption>Dietary Data Overview</TableCaption>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            {displayColumns.map((column) => (
              <TableHead key={column} className="font-semibold">{column.replace(/_/g, ' ')}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => (
            <TableRow key={rowIndex} className={row.note ? "bg-secondary font-semibold" : ""}>
              {displayColumns.map((column) => (
                <TableCell key={column}>
                  {row.note && column === displayColumns[0] ? row.note : (row[column] === undefined || row[column] === null ? '-' : String(row[column]))}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {grandTotalRow && (
          <TableFooter className="sticky bottom-0 bg-secondary font-bold z-10">
            <TableRow>
              {displayColumns.map((column, colIndex) => (
                <TableCell key={column}>
                  {colIndex === 0 ? "Grand Total" : (grandTotalRow[column] === undefined || grandTotalRow[column] === null ? '-' : String(grandTotalRow[column]))}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

export default DataTable;
