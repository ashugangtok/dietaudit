
"use client";

import type React from 'react';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { DietDataRow } from '@/types';
import { UploadCloud } from 'lucide-react';

interface FileUploadProps {
  onDataParsed: (data: DietDataRow[], headers: string[]) => void;
  onProcessing: (isProcessing: boolean) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed, onProcessing }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel') {
        setSelectedFile(file);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an Excel file (.xlsx or .xls).",
        });
        setSelectedFile(null);
        event.target.value = ''; // Reset file input
      }
    }
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
          header: 1, // To get headers as first array
          defval: "", // Default value for empty cells
        });

        if (jsonData.length < 2) { // At least one header row and one data row
          throw new Error("Excel file is empty or contains only headers.");
        }
        
        const headers = (jsonData[0] as any[]).map(String); // Ensure all headers are strings
        const parsedData: DietDataRow[] = jsonData.slice(1).map((rowArray: any) => {
          const rowObject: DietDataRow = {};
          headers.forEach((header, index) => {
            rowObject[header] = rowArray[index];
          });
          return rowObject;
        });
        
        onDataParsed(parsedData, headers);
        toast({
          title: "File Parsed Successfully",
          description: `${parsedData.length} rows of data loaded.`,
        });
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast({
          variant: "destructive",
          title: "Error Parsing File",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
        onDataParsed([], []); // Clear any existing data
      } finally {
        onProcessing(false);
      }
    };

    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "File Read Error",
        description: "Could not read the selected file.",
      });
      onProcessing(false);
    };

    reader.readAsBinaryString(selectedFile);
  };

  return (
    <div className="space-y-4 p-6 bg-card rounded-lg shadow">
      <h2 className="text-xl font-semibold text-card-foreground">Upload Dietary Data</h2>
      <div className="grid w-full max-w-sm items-center gap-2">
        <Label htmlFor="excel-file" className="sr-only">Upload Excel File</Label>
        <Input 
          id="excel-file" 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFileChange}
          aria-describedby="file-upload-help"
        />
        <p id="file-upload-help" className="text-sm text-muted-foreground">
          Supported formats: .xlsx, .xls.
        </p>
      </div>
      <Button onClick={handleFileUpload} disabled={!selectedFile} aria-label="Upload and process file">
        <UploadCloud className="mr-2 h-4 w-4" /> Upload & Process
      </Button>
    </div>
  );
};

export default FileUpload;
