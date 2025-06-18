
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
    const fileBuffer = Buffer.from(input.excelFileBase64, 'base64');
    
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json<DietDataRow>(worksheet, {
      header: 1, 
      defval: "", 
      blankrows: false, 
    });

    if (jsonData.length === 0) {
      return { parsedData: [], headers: [], error: "Excel file is completely empty or contains no readable sheets." };
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
        return { parsedData: [], headers: [], error: "Excel file does not contain any data or headers."};
    }

    const actualHeaders = rawHeaders.map((header, idx) => {
        let headerName = String(header || '').trim(); 
        if (headerName === "") {
            headerName = `column_${idx + 1}`;
        }
        let count = 0;
        let finalHeaderName = headerName;
        const tempHeaders = [...rawHeaders.slice(0, idx).map(String)]; 
        while(tempHeaders.includes(finalHeaderName)) {
            count++;
            finalHeaderName = `${headerName}_${count}`;
        }
        return finalHeaderName;
    });

    const parsedData: DietDataRow[] = jsonData.slice(headerRowIndex + 1).map((rowArray: any) => { 
      const rowObject: DietDataRow = {};
      actualHeaders.forEach((header, index) => {
        rowObject[header] = rowArray[index] !== undefined ? rowArray[index] : "";
      });
      return rowObject;
    }).filter(row => Object.values(row).some(val => val !== undefined && String(val).trim() !== "")); 

    if (parsedData.length === 0 && actualHeaders.length > 0) {
        return { parsedData: [], headers: actualHeaders };
    }
    
    return { parsedData, headers: actualHeaders };

  } catch (err) {
    console.error(`Error processing Excel file (${input.originalFileName}):`, err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during server-side Excel processing.";
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
