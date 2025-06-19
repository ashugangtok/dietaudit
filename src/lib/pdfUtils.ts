
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
  doc.text(title, 40, 40);

  const head = [tableColumns.map(colKey => {
    let headerText = colKey;
    if (colKey.startsWith('total_animal_')) {
      headerText = 'Total Animal';
    } else {
        // General beautification for other column keys
        headerText = colKey
          .replace(/_sum$|_average$|_count$|_first$|_max$/i, (match) => ` (${match.substring(1).charAt(0).toUpperCase() + match.substring(2)})`)
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
    return headerText;
  })];
  
  const body = tableData.map(row => {
    return tableColumns.map(column => {
      let cellValue = row[column];
      if (cellValue === PIVOT_BLANK_MARKER) {
        return '';
      }
      // For PDF, if it's a number (like in grand total for ingredient_qty_sum, or other numeric summaries)
      // format it. If it's already a string (like "69 Piece"), use it as is.
      if (typeof cellValue === 'number') {
        if (!Number.isInteger(cellValue) || (String(cellValue).split('.')[1] || '').length > 2) {
            return cellValue.toFixed(2); // Keep precision for PDF
        }
        return String(cellValue);
      }
      return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
  });

  let startY = 60; 

  if (grandTotalRow) {
    const totalRowData = tableColumns.map((column, colIndex) => {
        let cellValue = grandTotalRow[column];
        if (column === tableColumns[0] && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER || grandTotalRow[column] === null || String(grandTotalRow[column]).trim().toLowerCase() === "grand total")) {
            if (String(grandTotalRow.note).toLowerCase() === 'grand total' && grandTotalRow[column] === 'Grand Total') {
                 return "Grand Total";
            } else if (String(grandTotalRow.note).toLowerCase() === 'grand total' && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER)) {
                 return "Grand Total";
            }
        }
        
        if (cellValue === PIVOT_BLANK_MARKER) return '';
        if (typeof cellValue === 'number') {
            const numVal = cellValue as number;
            // For grand total ingredient_qty_sum, it remains numeric. Format it.
            return numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
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
        fillColor: [38, 153, 153], 
        textColor: [255,255,255] 
    }, 
    footStyles: { 
        fillColor: [220, 220, 220], 
        textColor: [0,0,0], 
        fontStyle: 'bold'
    },
    styles: { 
        fontSize: 7, 
        cellPadding: 2,
        overflow: 'ellipsize', 
    },
    columnStyles: tableColumns.reduce((acc, colName) => {
        acc[colName] = { cellWidth: 'auto' }; 
        return acc;
    }, {} as any),
    tableWidth: 'auto', 
    margin: { top: 40, right: 30, bottom: 40, left: 30 }, 
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    showFoot: 'lastPage', 
    showHead: 'everyPage', 
    didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 20);
    },
  });

  doc.save(`${fileName}.pdf`);
};
