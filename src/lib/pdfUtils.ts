
"use client";

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DietDataRow } from '@/types';
import { PIVOT_BLANK_MARKER } from '@/types';

export const exportToPdf = (
  tableData: DietDataRow[],
  tableColumns: string[],
  title: string,
  fileName: string,
  grandTotalRow?: DietDataRow
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  doc.setFontSize(16);
  doc.text(title, 40, 40); // Adjusted Y for title

  const head = [tableColumns.map(col => {
    // Attempt to convert snake_case_with_number_sum to "Snake Case With Number (Sum)"
    return col
      .replace(/_sum$|_average$|_count$|_first$|_max$/i, (match) => ` (${match.substring(1).charAt(0).toUpperCase() + match.substring(2)})`)
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  })];
  
  const body = tableData.map(row => {
    return tableColumns.map(column => {
      let cellValue = row[column];
      if (cellValue === PIVOT_BLANK_MARKER) {
        return '';
      }
      if (typeof cellValue === 'number') {
        // Format numbers to 2 decimal places if they are not integers, or if they have more than 2 decimal places
        if (!Number.isInteger(cellValue) || (String(cellValue).split('.')[1] || '').length > 2) {
            return cellValue.toFixed(2);
        }
        return String(cellValue);
      }
      return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
  });

  let startY = 60; // Initial startY for the table

  if (grandTotalRow) {
    const totalRowData = tableColumns.map((column, colIndex) => {
        let cellValue = grandTotalRow[column];
        if (column === tableColumns[0] && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER || grandTotalRow[column] === null || String(grandTotalRow[column]).trim().toLowerCase() === "grand total")) {
             // For the first column in GT, explicitly set to "Grand Total" if it's the GT label cell
            if (String(grandTotalRow.note).toLowerCase() === 'grand total' && grandTotalRow[column] === 'Grand Total') {
                 return "Grand Total";
            } else if (String(grandTotalRow.note).toLowerCase() === 'grand total' && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER)) {
                 return "Grand Total";
            }
        }
        
        if (cellValue === PIVOT_BLANK_MARKER) return '';
        if (typeof cellValue === 'number') {
            const numVal = cellValue as number;
            if (!Number.isInteger(numVal) || (String(numVal).split('.')[1] || '').length > 2) {
                return numVal.toFixed(2);
            }
            return String(numVal);
        }
        return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
    body.push(totalRowData); 
  }


  autoTable(doc, {
    head: head,
    body: body,
    startY: startY,
    theme: 'striped',
    headStyles: { 
        fillColor: [38, 153, 153], // Approx --accent HSL(180 60% 40%)
        textColor: [255,255,255] 
    }, 
    footStyles: { // Style for the grand total if it were a separate footer
        fillColor: [220, 220, 220], 
        textColor: [0,0,0], 
        fontStyle: 'bold'
    },
    styles: { 
        fontSize: 7, // Smaller font for more data
        cellPadding: 2,
        overflow: 'ellipsize', // Handle text overflow
    },
    columnStyles: tableColumns.reduce((acc, colName) => {
        acc[colName] = { cellWidth: 'auto' }; // auto width, but can be fine-tuned
        return acc;
    }, {} as any),
    tableWidth: 'auto', // Fit content or page
    margin: { top: 40, right: 30, bottom: 40, left: 30 }, // Margins
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    showFoot: 'lastPage', // Show footer only on the last page if grandTotalRow was a tfoot
    showHead: 'everyPage', // Repeat headers on new pages
    didDrawPage: (data) => {
        // Optional: Page numbering
        doc.setFontSize(8);
        doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 20);
    },
  });

  doc.save(`${fileName}.pdf`);
};

