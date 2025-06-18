
'use server';
/**
 * @fileOverview A Genkit flow to parse an Excel file from a base64 string.
 *
 * - parseExcelFlow - Parses a base64 encoded Excel file string and returns structured data.
 * - ParseExcelInput - The input type for the parseExcelFlow.
 * - ParseExcelOutput - The return type for the parseExcelFlow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
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


export async function parseExcelFlow(input: ParseExcelInput): Promise<ParseExcelOutput> {
  console.log(`[parseExcelFlow] Received request for file: ${input.originalFileName}`);
  try {
    if (!input.excelFileBase64) {
      console.warn("[parseExcelFlow] No Excel file content provided.");
      return { parsedData: [], headers: [], error: "No Excel file content provided." };
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(input.excelFileBase64, 'base64');
      console.log(`[parseExcelFlow] File buffer size for ${input.originalFileName}: ${fileBuffer.length} bytes.`);
      // Heuristic: If buffer is very large (e.g., > 10MB raw, base64 would be ~13MB string), parsing might be too slow or result in too large JSON.
      // Next.js default body parser limit is 1MB for API routes, server actions might have different/configurable limits.
      // A 10MB buffer could result in a much larger JSON.
      if (fileBuffer.length > 10 * 1024 * 1024) { // 10MB
        console.warn(`[parseExcelFlow] File buffer for ${input.originalFileName} is very large: ${fileBuffer.length} bytes. This might lead to performance issues or exceed server limits.`);
      }
    } catch (bufferError: any) {
      console.error(`[parseExcelFlow] Error creating buffer from base64 for ${input.originalFileName}:`, bufferError);
      return { 
        parsedData: [], 
        headers: [], 
        error: `Server error creating buffer from file content: ${bufferError.message || 'Unknown buffer error'}` 
      };
    }
    
    if (fileBuffer.length === 0) {
        console.warn(`[parseExcelFlow] Provided Excel file content for ${input.originalFileName} is empty after base64 decoding.`);
        return { parsedData: [], headers: [], error: "Provided Excel file content is empty."};
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: false, bookVBA: false });

    if (!workbook || workbook.SheetNames.length === 0) {
      console.warn(`[parseExcelFlow] Could not read the Excel workbook or it contains no sheets for ${input.originalFileName}.`);
      return { parsedData: [], headers: [], error: "Could not read the Excel workbook or it contains no sheets." };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      console.warn(`[parseExcelFlow] Could not read the sheet named '${sheetName}' for ${input.originalFileName}.`);
      return { parsedData: [], headers: [], error: `Could not read the sheet named '${sheetName}'.` };
    }
    
    const jsonData = XLSX.utils.sheet_to_json<DietDataRow>(worksheet, {
      header: 1, 
      defval: "", 
      blankrows: false, 
    });
    
    console.log(`[parseExcelFlow] Parsed ${jsonData.length} raw rows from ${input.originalFileName}.`);


    if (jsonData.length === 0 && fileBuffer.length > 500) { 
      console.warn(`[parseExcelFlow] Excel file ${input.originalFileName} appears to have content, but no data could be extracted. The sheet might be empty or in an unsupported format.`);
      return { parsedData: [], headers: [], error: "Excel file appears to have content, but no data could be extracted. The sheet might be empty or in an unsupported format." };
    }
     if (jsonData.length === 0) {
      console.warn(`[parseExcelFlow] Excel file ${input.originalFileName} is empty or contains no readable data rows after parsing.`);
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
        console.warn(`[parseExcelFlow] No valid header row found in the Excel sheet for ${input.originalFileName}.`);
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

    console.log(`[parseExcelFlow] Processed ${parsedData.length} data rows with ${actualHeaders.length} headers for ${input.originalFileName}.`);

    if (parsedData.length === 0 && actualHeaders.length > 0) {
        // This case is handled on client with a specific toast.
        console.log(`[parseExcelFlow] File ${input.originalFileName} contains headers but no data rows after filtering empty rows.`);
        return { parsedData: [], headers: actualHeaders };
    }
    
    // Potentially large data check:
    const responsePayloadSize = JSON.stringify({ parsedData, headers: actualHeaders }).length;
    console.log(`[parseExcelFlow] Estimated response payload size for ${input.originalFileName}: ${responsePayloadSize} bytes.`);
    if (responsePayloadSize > 4 * 1024 * 1024) { // 4MB, a common server limit for JSON payloads
        console.warn(`[parseExcelFlow] Response payload for ${input.originalFileName} is very large: ${responsePayloadSize} bytes. This might exceed server limits and cause 'unexpected response'.`);
        // Consider returning an error or a subset of data if this is a recurring issue.
        // For now, we'll still attempt to return it.
    }


    return { parsedData, headers: actualHeaders };

  } catch (err: any) {
    console.error(`[parseExcelFlow] Critical error during Excel processing for file (${input.originalFileName}):`, err);
    let errorMessage = "An critical error occurred on the server during Excel processing.";
    if (err instanceof Error) {
        errorMessage = err.message;
    } else if (typeof err === 'string') {
        errorMessage = err;
    } else if (err && typeof err.message === 'string') {
        errorMessage = err.message;
    }
    
    if (errorMessage.includes("Corrupted zip") || (err && typeof err.code === 'string' && err.code === 'Z_DATA_ERROR')) {
        errorMessage = "The Excel file appears to be corrupted or is not a valid .xlsx/.xls file.";
    } else if (errorMessage.includes("Cell Styles")) {
        errorMessage = "Error processing cell styles in the Excel file. Try saving without complex styling.";
    } else if (err.name === 'RangeError' && errorMessage.toLowerCase().includes('buffer')) {
        errorMessage = "Error related to buffer size or memory allocation while processing the Excel file. The file might be too large or malformed.";
    }
    
    return { parsedData: [], headers: [], error: errorMessage };
  }
}

// Genkit flow definition (optional if only calling the function directly as a server action)
/*
const parseExcelServerFlow = ai.defineFlow(
  {
    name: 'parseExcelServerFlow',
    inputSchema: ParseExcelInputSchema,
    outputSchema: ParseExcelOutputSchema,
  },
  async (input) => {
    return parseExcelFlow(input);
  }
);
*/


    