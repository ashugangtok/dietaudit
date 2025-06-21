
'use server';
/**
 * @fileOverview A server action to parse an Excel file from a base64 string.
 *
 * - parseExcelAction - Parses a base64 encoded Excel file string and returns structured data.
 * - ParseExcelInput - The input type for the parseExcelAction.
 * - ParseExcelOutput - The return type for the parseExcelAction.
 */

import { z } from 'zod';
import * as XLSX from 'xlsx';
import type { DietDataRow } from '@/types';

const ParseExcelInputSchema = z.object({
  excelFileBase64: z
    .string()
    .describe(
      "The content of the Excel file, base64 encoded."
    ),
  originalFileName: z.string().describe('The original name of the uploaded file, for context or logging.'),
});
export type ParseExcelInput = z.infer<typeof ParseExcelInputSchema>;

const ParseExcelOutputSchema = z.object({
  parsedData: z.array(z.custom<DietDataRow>()).describe('The array of parsed data rows.'),
  headers: z.array(z.string()).describe('The array of extracted column headers.'),
  error: z.string().optional().describe('An error message if parsing failed.'),
});
export type ParseExcelOutput = z.infer<typeof ParseExcelOutputSchema>;


export async function parseExcelAction(input: ParseExcelInput): Promise<ParseExcelOutput> {
  console.log(`[parseExcelAction] START: Processing file: ${input.originalFileName}`);
  try {
    if (!input.excelFileBase64) {
      console.warn("[parseExcelAction] No Excel file content provided.");
      return { parsedData: [], headers: [], error: "No Excel file content provided." };
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(input.excelFileBase64, 'base64');
    } catch (bufferError: any) {
      console.error(`[parseExcelAction] ERROR: Could not create buffer from base64 for ${input.originalFileName}:`, bufferError);
      return { 
        parsedData: [], 
        headers: [], 
        error: `Server error decoding file content. It might be corrupted.`
      };
    }
    
    console.log(`[parseExcelAction] OK: Buffer created. Size: ${fileBuffer.length} bytes.`);

    if (fileBuffer.length === 0) {
        console.warn(`[parseExcelAction] WARN: Excel file content for ${input.originalFileName} is empty after decoding.`);
        return { parsedData: [], headers: [], error: "The Excel file content is empty."};
    }

    console.log(`[parseExcelAction] INFO: Reading workbook for ${input.originalFileName}...`);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: false, bookVBA: false });
    console.log(`[parseExcelAction] OK: Workbook read for ${input.originalFileName}.`);

    if (!workbook || workbook.SheetNames.length === 0) {
      console.warn(`[parseExcelAction] WARN: Could not read workbook or it has no sheets: ${input.originalFileName}.`);
      return { parsedData: [], headers: [], error: "Could not read the Excel workbook or it contains no sheets." };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.warn(`[parseExcelAction] WARN: Could not find sheet '${sheetName}' in ${input.originalFileName}.`);
      return { parsedData: [], headers: [], error: `Could not read the first sheet named '${sheetName}'.` };
    }
    
    console.log(`[parseExcelAction] INFO: Converting sheet to JSON for ${input.originalFileName}...`);
    const jsonData = XLSX.utils.sheet_to_json<DietDataRow>(worksheet, {
      header: 1, 
      defval: "", 
      blankrows: false, 
    });
    console.log(`[parseExcelAction] OK: Converted to JSON, ${jsonData.length} raw rows found.`);


    if (jsonData.length === 0 && fileBuffer.length > 500) { 
      console.warn(`[parseExcelAction] Excel file ${input.originalFileName} appears to have content, but no data could be extracted.`);
      return { parsedData: [], headers: [], error: "Excel file appears to have content, but no data could be extracted. The sheet might be empty or in an unsupported format." };
    }
     if (jsonData.length === 0) {
      console.warn(`[parseExcelAction] Excel file ${input.originalFileName} is empty or contains no readable data rows.`);
      return { parsedData: [], headers: [], error: "Excel file is empty or contains no readable data rows after parsing." };
    }
    
    let headerRowIndex = -1;
    let rawHeaders: any[] = [];
    for (let i = 0; i < jsonData.length; i++) {
        const potentialHeaderRow = (jsonData[i] as any[]); 
        if (potentialHeaderRow.some(cell => String(cell).trim() !== "")) {
            headerRowIndex = i;
            rawHeaders = potentialHeaderRow;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.warn(`[parseExcelAction] No valid header row found in ${input.originalFileName}.`);
        return { parsedData: [], headers: [], error: "No valid header row found in the Excel sheet."};
    }

    const actualHeaders: string[] = [];
    rawHeaders.forEach((header) => {
        let baseName = String(header || '').trim();
        let currentCandidateName = baseName;

        if (baseName === "") {
            let i = 1;
            currentCandidateName = `column_${i}`;
            while (actualHeaders.includes(currentCandidateName)) {
                i++;
                currentCandidateName = `column_${i}`;
            }
        } else {
            let count = 0;
            if (actualHeaders.includes(currentCandidateName)) {
                count = 1; 
                currentCandidateName = `${baseName}_${count}`;
            }
            while (actualHeaders.includes(currentCandidateName)) {
                count++;
                currentCandidateName = `${baseName}_${count}`;
            }
        }
        actualHeaders.push(currentCandidateName);
    });

    const parsedData: DietDataRow[] = jsonData.slice(headerRowIndex + 1).map((rowArray: any) => { 
      const rowObject: DietDataRow = {};
      actualHeaders.forEach((header, index) => {
        rowObject[header] = rowArray[index] !== undefined ? rowArray[index] : "";
      });
      return rowObject;
    }).filter(row => Object.values(row).some(val => val !== undefined && String(val).trim() !== "")); 

    console.log(`[parseExcelAction] SUCCESS: Processed ${parsedData.length} data rows with ${actualHeaders.length} headers for ${input.originalFileName}.`);
    
    return { parsedData, headers: actualHeaders };

  } catch (err: any) {
    console.error(`[parseExcelAction] FATAL: Critical error during Excel processing for file (${input.originalFileName}):`, err);
    
    let errorMessage = "An unexpected server error occurred during Excel processing. The file may be too large for the server to handle, or it might be corrupted.";
    if (err.name === 'RangeError' || (err.message && err.message.toLowerCase().includes('memory'))) {
        errorMessage = "The server ran out of memory while processing the Excel file. Please try a smaller file.";
    } else if (err.message && (err.message.includes("Corrupted zip") || (err.code === 'Z_DATA_ERROR'))) {
        errorMessage = "The Excel file appears to be corrupted or is not a valid format. Please re-save it and try again.";
    }
    
    return { parsedData: [], headers: [], error: errorMessage };
  }
}
