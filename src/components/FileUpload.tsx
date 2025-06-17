
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
  const [fileName, setFileName] = useState<string>("No file chosen");
  const { toast } = useToast();

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
        event.target.value = ''; // Reset file input
      }
    } else {
      setSelectedFile(null);
      setFileName("No file chosen");
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
          header: 1, 
          defval: "", 
        });

        if (jsonData.length < 1) { // Check if there's any data at all, even just a header row
          throw new Error("Excel file is empty.");
        }
        
        const headers = (jsonData[0] as any[]).map(String); 
        // Ensure headers are unique, append index if not
        const uniqueHeaders = headers.map((header, index) => {
          let count = 0;
          let newHeader = header;
          while (headers.indexOf(newHeader) !== index) {
            count++;
            newHeader = `${header}_${count}`;
          }
          return newHeader;
        });

        const parsedData: DietDataRow[] = jsonData.slice(1).map((rowArray: any) => {
          const rowObject: DietDataRow = {};
          uniqueHeaders.forEach((header, index) => {
            rowObject[header] = rowArray[index];
          });
          return rowObject;
        });
        
        if (parsedData.length === 0 && uniqueHeaders.length > 0) {
            toast({
                variant: "default",
                title: "File Contains Only Headers",
                description: "The Excel file seems to contain only headers and no data rows.",
            });
            onDataParsed([], uniqueHeaders); // Pass headers even if no data
        } else if (parsedData.length === 0 && uniqueHeaders.length === 0) {
             throw new Error("Excel file is empty or has no recognizable headers.");
        } else {
            onDataParsed(parsedData, uniqueHeaders);
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
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Label htmlFor="excel-file" className="sr-only">Choose File</Label>
        <Button asChild variant="outline" className="cursor-pointer">
            <div>
                <UploadCloud className="mr-2 h-4 w-4" /> Choose File
                <Input 
                  id="excel-file" 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={handleFileChange}
                  className="sr-only" 
                  aria-describedby="file-upload-help"
                />
            </div>
        </Button>
        <span className="text-sm text-muted-foreground truncate" style={{maxWidth: '200px'}}>{fileName}</span>
      </div>
       <p id="file-upload-help" className="text-sm text-muted-foreground">
          Please upload an Excel file (.xlsx) with the diet plan.
        </p>
      <Button onClick={handleFileUpload} disabled={!selectedFile || isProcessingFile} className="w-full sm:w-auto">
        <UploadCloud className="mr-2 h-4 w-4" /> Upload and Process
      </Button>
    </div>
  );
};

export default FileUpload;
