
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
  try {
    if (!input.excelFileBase64) {
      return { parsedData: [], headers: [], error: "No Excel file content provided." };
    }
    const fileBuffer = Buffer.from(input.excelFileBase64, 'base64');
    
    if (fileBuffer.length === 0) {
        return { parsedData: [], headers: [], error: "Provided Excel file content is empty."};
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: false, bookVBA: false });

    if (!workbook || workbook.SheetNames.length === 0) {
      return { parsedData: [], headers: [], error: "Could not read the Excel workbook or it contains no sheets." };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return { parsedData: [], headers: [], error: `Could not read the sheet named '${sheetName}'.` };
    }
    
    const jsonData = XLSX.utils.sheet_to_json<DietDataRow>(worksheet, {
      header: 1, 
      defval: "", 
      blankrows: false, 
    });

    if (jsonData.length === 0 && fileBuffer.length > 500) { // Check if jsonData is empty for a non-trivial file size
      return { parsedData: [], headers: [], error: "Excel file appears to have content, but no data could be extracted. The sheet might be empty or in an unsupported format." };
    }
     if (jsonData.length === 0) {
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
            // Check if currentCandidateName (which is baseName initially) exists
            if (actualHeaders.includes(currentCandidateName)) {
                count = 1; // Start suffixing with _1
                currentCandidateName = `${baseName}_${count}`;
            }
            // Ensure the suffixed name is unique
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

    if (parsedData.length === 0 && actualHeaders.length > 0) {
        // This case is handled on client with a specific toast.
        return { parsedData: [], headers: actualHeaders };
    }
    
    return { parsedData, headers: actualHeaders };

  } catch (err) {
    console.error(`Error processing Excel file (${input.originalFileName}):`, err);
    let errorMessage = "An unknown error occurred during server-side Excel processing.";
    if (err instanceof Error) {
        errorMessage = err.message;
    }
    // More specific error for known xlsx issues if possible
    if (errorMessage.includes("Corrupted zip")) {
        errorMessage = "The Excel file appears to be corrupted or is not a valid .xlsx/.xls file.";
    } else if (errorMessage.includes("Cell Styles")) {
        errorMessage = "Error processing cell styles in the Excel file. Try saving without complex styling.";
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

