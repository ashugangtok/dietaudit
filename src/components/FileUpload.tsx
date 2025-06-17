
"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { DietDataRow } from '@/types';
import { UploadCloud } from 'lucide-react';

interface FileUploadProps {
  onDataParsed: (data: DietDataRow[], headers: string[]) => void;
  onProcessing: (isProcessing: boolean) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed, onProcessing }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("No file chosen");
  const [isCurrentlyProcessing, setIsCurrentlyProcessing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        setFileName(file.name);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an Excel file (.xlsx or .xls).",
        });
        setSelectedFile(null);
        setFileName("No file chosen");
        if(fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
        }
      }
    } else {
      setSelectedFile(null);
      setFileName("No file chosen");
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast({
        variant: "destructive",
        title: "No File Selected",
        description: "Please select an Excel file to upload.",
      });
      return;
    }

    setIsCurrentlyProcessing(true);
    onProcessing(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("File data is empty.");
        
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<DietDataRow>(worksheet, {
          header: 1, 
          defval: "", 
          blankrows: false, // Ensure blank rows are not included as data
        });

        if (jsonData.length === 0) { // No rows at all
          throw new Error("Excel file is completely empty or contains no readable sheets.");
        }
        
        let headers = (jsonData[0] as any[]).map(String); 
        // Filter out completely empty header cells
        headers = headers.filter(header => header.trim() !== "");

        if (headers.length === 0 && jsonData.length <=1 ) { // Only one row, and it's empty after filtering headers
             throw new Error("Excel file has no valid headers or data.");
        }


        const uniqueHeaders = headers.map((header, index) => {
          let count = 0;
          let newHeader = header;
          let originalHeader = header;
          const tempHeaders = [...headers]; // Work on a copy for checking duplicates
          while (tempHeaders.filter((h,i) => i < index && h === originalHeader).length > 0 || (tempHeaders.filter(h => h === newHeader).length > 1 && tempHeaders.indexOf(newHeader) !== index) ) {
            count++;
            newHeader = `${originalHeader}_${count}`;
          }
          return newHeader;
        });
        
        // Find the first row that is not entirely empty to be considered as header.
        let headerRowIndex = 0;
        let actualHeaders: string[] = [];
        for (let i = 0; i < jsonData.length; i++) {
            const potentialHeaderRow = (jsonData[i] as any[]).map(String);
            if (potentialHeaderRow.some(cell => cell.trim() !== "")) {
                headerRowIndex = i;
                actualHeaders = potentialHeaderRow.map((header, idx) => {
                    let count = 0;
                    let newHeader = header.trim() || `column_${idx+1}`; // Use column_N if header is empty
                    const tempHeaders = [...potentialHeaderRow];
                    while(tempHeaders.filter((h,k) => k < idx && h === header.trim()).length > 0 || (tempHeaders.filter(h => h === newHeader).length > 1 && tempHeaders.indexOf(newHeader) !== idx) ) {
                        count++;
                        newHeader = `${header.trim() || `column_${idx+1}`}_${count}`;
                    }
                    return newHeader;
                });
                break;
            }
        }
        
        if (actualHeaders.length === 0) {
             throw new Error("Excel file does not contain any valid header row.");
        }

        const parsedData: DietDataRow[] = jsonData.slice(headerRowIndex + 1).map((rowArray: any) => {
          const rowObject: DietDataRow = {};
          actualHeaders.forEach((header, index) => {
            rowObject[header] = rowArray[index] !== undefined ? rowArray[index] : ""; // Ensure undefined becomes empty string
          });
          return rowObject;
        }).filter(row => Object.values(row).some(val => val !== undefined && String(val).trim() !== "")); // Filter out completely empty data rows


        if (parsedData.length === 0 && actualHeaders.length > 0) {
            toast({
                variant: "default",
                title: "File Contains Only Headers",
                description: "The Excel file seems to contain only headers and no data rows.",
            });
            onDataParsed([], actualHeaders); 
        } else {
            onDataParsed(parsedData, actualHeaders);
            toast({
              title: "File Parsed Successfully",
              description: `${parsedData.length} rows of data loaded.`,
            });
        }

      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast({
          variant: "destructive",
          title: "Error Parsing File",
          description: error instanceof Error ? error.message : "An unknown error occurred during parsing.",
        });
        onDataParsed([], []); 
      } finally {
        setIsCurrentlyProcessing(false);
        onProcessing(false);
      }
    };

    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "File Read Error",
        description: "Could not read the selected file.",
      });
      setIsCurrentlyProcessing(false);
      onProcessing(false);
    };

    reader.readAsBinaryString(selectedFile);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Button onClick={triggerFileInput} variant="outline" className="cursor-pointer">
          <UploadCloud className="mr-2 h-4 w-4" /> Choose File
        </Button>
        <Input 
          ref={fileInputRef}
          id="excel-file" 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileChange}
          className="hidden" // Keep it hidden
          aria-describedby="file-upload-help"
        />
        <span className="text-sm text-muted-foreground truncate" style={{maxWidth: '200px'}}>{fileName}</span>
      </div>
       <p id="file-upload-help" className="text-sm text-muted-foreground">
          Please upload an Excel file (.xlsx) with the diet plan.
        </p>
      <Button onClick={handleFileUpload} disabled={!selectedFile || isCurrentlyProcessing} className="w-full sm:w-auto">
        <UploadCloud className="mr-2 h-4 w-4" /> Upload and Process
      </Button>
    </div>
  );
};

export default FileUpload;

