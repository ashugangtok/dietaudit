
"use client";

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DietDataRow } from '@/types';
import { PIVOT_BLANK_MARKER } from '@/types';

const getAbbreviatedUom = (uom: string): string => {
  if (!uom) return '';
  const lowerUom = uom.toLowerCase().trim();
  if (lowerUom === 'kilogram' || lowerUom === 'kilograms') return 'kg';
  if (lowerUom === 'piece' || lowerUom === 'pieces') return 'pcs';
  return uom.trim();
};

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
    if (colKey === 'total_qty_required_sum') return 'Total Qty Required';
    if (colKey === 'Received Qty') return 'Received Qty';
    if (colKey === 'Difference') return 'Difference';

    let headerText = colKey;
    if (colKey.startsWith('total_animal_')) {
      headerText = 'Animal Count';
    } else if (colKey.startsWith('ingredient_qty_')) {
      headerText = 'Qty/Animal';
    } else {
        headerText = colKey
          .replace(/_sum$|_average$|_count$|_first$|_max$/i, '')
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
    return headerText;
  })];
  
  const body: (string | number)[][] = tableData.map(row => {
    return tableColumns.map(column => {
      let cellValue = row[column];
      
      if (cellValue === PIVOT_BLANK_MARKER) {
        return '';
      }
      if (typeof cellValue === 'number') {
        return cellValue.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
      }
      return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
  });

  let foot: (string|number)[][] = [];
  if (grandTotalRow) {
    const totalRowData = tableColumns.map((column) => {
        if (column === 'Received Qty' || column === 'Difference') {
            return '';
        }
        
        if (column === tableColumns[0]) {
             return "Grand Total";
        }

        let cellValue = grandTotalRow[column];
        
        if (cellValue === PIVOT_BLANK_MARKER) return '';
        if (typeof cellValue === 'number') {
            const numVal = cellValue as number;
            return numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
        }
        return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
    foot.push(totalRowData); 
  }

  autoTable(doc, {
    head: head,
    body: body,
    foot: foot.length > 0 ? foot : undefined,
    startY: 60,
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
    showFoot: foot.length > 0 ? 'lastPage': 'never', 
    showHead: 'everyPage', 
    didParseCell: function (data) {
      if (typeof data.cell.raw === 'string' && data.cell.raw.includes('\n')) {
          data.cell.styles.valign = 'middle';
      }
    },
    didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 20);
    },
  });

  doc.save(`${fileName}.pdf`);
};
