
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
  grandTotalRow?: DietDataRow,
  isViewDataPdf: boolean = false, // Flag for View Data specific PDF formatting
  allHeadersForPdf?: string[] // Pass allHeaders for context
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
      headerText = 'Animal Count';
    } else if (colKey.startsWith('ingredient_qty_') && colKey.endsWith('_sum')) {
      headerText = 'Ingredient Qty';
    } else if (colKey.startsWith('base_uom_name_') && colKey.endsWith('_first')) {
      headerText = 'UoM'; 
    } else {
        headerText = colKey
          .replace(/_sum$|_average$|_count$|_first$|_max$/i, (match) => ` (${match.substring(1).charAt(0).toUpperCase() + match.substring(2)})`)
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
    return headerText;
  })];
  
  let body: (string | number)[][] = [];
  const ingredientQtySumKeyPdf = tableColumns.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
  const totalAnimalFirstKeyPdf = tableColumns.find(k => k.startsWith('total_animal_') && k.endsWith('_first'));
  const uomRowDataKeyPdf = allHeadersForPdf?.includes('base_uom_name') ? tableColumns.find(col => col.startsWith('base_uom_name_') && col.endsWith('_first')) : undefined;
  const ingredientNameKeyPdf = tableColumns.find(k => k.startsWith('ingredient_name'));


  if (isViewDataPdf && ingredientQtySumKeyPdf && totalAnimalFirstKeyPdf) {
    tableData.forEach(row => {
      // Row 1: Per Animal
      body.push(tableColumns.map(column => {
        let cellValue = row[column];
        if (column === ingredientQtySumKeyPdf && uomRowDataKeyPdf && row[uomRowDataKeyPdf] && typeof cellValue === 'number') {
            const uom = row[uomRowDataKeyPdf];
            if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 return `${cellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
        if (cellValue === PIVOT_BLANK_MARKER) return '';
        if (typeof cellValue === 'number') {
          return Number.isInteger(cellValue) && !String(cellValue).includes('.') ? String(cellValue) : cellValue.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
        }
        return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
      }));

      // Row 2: Total Required
      const perAnimalQty = Number(row[ingredientQtySumKeyPdf] || 0);
      const animalCount = Number(row[totalAnimalFirstKeyPdf] || 0);
      const totalRequiredQty = perAnimalQty * animalCount;
      
      body.push(tableColumns.map((column, colIndex) => {
        if (column === ingredientNameKeyPdf || (colIndex === 0 && !ingredientNameKeyPdf) ) { // Crude way to find the first displayable grouping column for the label
             return `  ↳ Total Required`;
        }
        if (column === ingredientQtySumKeyPdf) {
          let displayVal: string | number = totalRequiredQty;
          if (uomRowDataKeyPdf && row[uomRowDataKeyPdf] && typeof totalRequiredQty === 'number') {
             const uom = row[uomRowDataKeyPdf];
             if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 displayVal = `${totalRequiredQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
             } else {
                displayVal = totalRequiredQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
             }
          } else if (typeof totalRequiredQty === 'number') {
             displayVal = totalRequiredQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
          }
          return displayVal;
        }
        // For other columns in the "Total Required" row, display blank.
        return ''; 
      }));
    });
  } else {
      body = tableData.map(row => {
        return tableColumns.map(column => {
          let cellValue = row[column];
          if (cellValue === PIVOT_BLANK_MARKER) {
            return '';
          }
          if (typeof cellValue === 'number') {
            if (!Number.isInteger(cellValue) || (String(cellValue).split('.')[1] || '').length > 2) {
                return cellValue.toFixed(4); 
            }
            return String(cellValue);
          }
          return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
        });
      });
  }


  let foot: (string|number)[][] = [];
  if (grandTotalRow) {
    const totalRowData = tableColumns.map((column) => {
        let cellValue = grandTotalRow[column];
        if (column === tableColumns[0] && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER || grandTotalRow[column] === null || String(grandTotalRow[column]).trim().toLowerCase() === "grand total")) {
            if (String(grandTotalRow.note).toLowerCase() === 'grand total' && grandTotalRow[column] === 'Grand Total') {
                 return isViewDataPdf ? "Grand Total (Per Animal)" : "Grand Total";
            } else if (String(grandTotalRow.note).toLowerCase() === 'grand total' && (grandTotalRow[column] === undefined || grandTotalRow[column] === PIVOT_BLANK_MARKER)) {
                 return isViewDataPdf ? "Grand Total (Per Animal)" : "Grand Total";
            }
        }
        if (column === ingredientQtySumKeyPdf && uomRowDataKeyPdf && grandTotalRow[uomRowDataKeyPdf] && typeof cellValue === 'number') {
            const uom = grandTotalRow[uomRowDataKeyPdf];
            if (uom && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 return `${cellValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
        if (cellValue === PIVOT_BLANK_MARKER) return '';
        if (typeof cellValue === 'number') {
            const numVal = cellValue as number;
            return numVal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
        }
        return (cellValue === undefined || cellValue === null ? '' : String(cellValue));
    });
    foot.push(totalRowData); 

    if (isViewDataPdf && ingredientQtySumKeyPdf && totalAnimalFirstKeyPdf) {
        const grandTotalRequiredQtyPdf = tableData.reduce((sum, row) => {
            const perAnimalQty = Number(row[ingredientQtySumKeyPdf] || 0);
            const animalCount = Number(row[totalAnimalFirstKeyPdf] || 0);
            return sum + (perAnimalQty * animalCount);
        }, 0);

        foot.push(tableColumns.map((column, colIndex) => {
            if (colIndex === 0) return "Grand Total (Total Required)";
            if (column === ingredientQtySumKeyPdf) {
                let displayVal: string | number = grandTotalRequiredQtyPdf;
                const uomForGrandTotalRequired = uomRowDataKeyPdf ? grandTotalRow[uomRowDataKeyPdf] : undefined;
                if (uomForGrandTotalRequired && typeof uomForGrandTotalRequired === 'string' && uomForGrandTotalRequired.trim() !== '' && uomForGrandTotalRequired !== PIVOT_BLANK_MARKER) {
                    displayVal = `${grandTotalRequiredQtyPdf.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uomForGrandTotalRequired.trim()}`;
                } else {
                     displayVal = grandTotalRequiredQtyPdf.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                }
                return displayVal;
            }
            return '';
        }));
    }
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
      if (data.row.section === 'body') {
        const rowIndex = data.row.index;
        // For View Data PDF, odd body rows (0-indexed) are the "Total Required" sub-rows
        if (isViewDataPdf && rowIndex % 2 !== 0) { 
          data.cell.styles.fillColor = [240, 240, 240]; // Light gray for sub-rows
          if (data.cell.raw === `  ↳ Total Required`) {
             // Potentially add indentation or specific style to the label cell
          }
        }
      }

      const columnKey = String(data.column.dataKey || '').trim();
      if (columnKey.startsWith("Difference ")) {
        const cellRawValue = data.cell.raw;
        if (cellRawValue !== null && cellRawValue !== undefined) {
          const cellStringValue = String(cellRawValue).trim();
          if (cellStringValue !== '') {
            const cleanedStringValue = cellStringValue.replace(/[^\d.-]/g, '');
            const numericValue = parseFloat(cleanedStringValue);
            if (!isNaN(numericValue)) {
              if (numericValue < 0) data.cell.styles.textColor = [220, 53, 69]; 
              else if (numericValue > 0) data.cell.styles.textColor = [0, 123, 255];
            }
          }
        }
      }
    },
    didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 50, doc.internal.pageSize.height - 20);
    },
  });

  doc.save(`${fileName}.pdf`);
};


