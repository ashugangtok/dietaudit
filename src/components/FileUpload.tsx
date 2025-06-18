
"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { DietDataRow } from '@/types';
import { UploadCloud } from 'lucide-react';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow'; // Import the new flow

interface FileUploadProps {
  onDataParsed: (data: DietDataRow[], headers: string[]) => void;
  onProcessing: (isProcessing: boolean) => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed, onProcessing }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("No file chosen");
  const [isCurrentlyProcessing, setIsCurrentlyProcessing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `Please upload a file smaller than ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        });
        setSelectedFile(null);
        setFileName("No file chosen");
        if(fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
        }
        return;
      }

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

    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) throw new Error("File data is empty or could not be read as Data URL.");
        
        const base64Content = dataUrl.split(',')[1];
        if (!base64Content) throw new Error("Could not extract base64 content from Data URL.");

        const result = await parseExcelFlow({ excelFileBase64: base64Content, fileName: selectedFile.name });

        if (result.error) {
          throw new Error(result.error);
        }

        if (result.parsedData.length === 0 && result.headers.length > 0) {
            toast({
                variant: "default",
                title: "File Contains Only Headers",
                description: "The Excel file seems to contain only headers and no data rows.",
            });
        } else if (result.parsedData.length === 0 && result.headers.length === 0 ) {
             toast({
                variant: "destructive",
                title: "No Data Extracted",
                description: "Could not extract any data or headers from the file. It might be empty or corrupted.",
            });
        } else {
            toast({
              title: "File Processed Successfully",
              description: `${result.parsedData.length} rows of data loaded.`,
            });
        }
        onDataParsed(result.parsedData, result.headers);

      } catch (error) {
        console.error("Error processing Excel file via flow:", error);
        toast({
          variant: "destructive",
          title: "Error Processing File",
          description: error instanceof Error ? error.message : "An unknown error occurred during server-side processing. The file might be too large or malformed.",
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
        description: "Could not read the selected file locally before sending to server.",
      });
      setIsCurrentlyProcessing(false);
      onProcessing(false); 
    };

    reader.readAsDataURL(selectedFile);
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
          className="hidden" 
          aria-describedby="file-upload-help"
        />
        <span className="text-sm text-muted-foreground truncate" style={{maxWidth: '200px'}}>{fileName}</span>
      </div>
       <p id="file-upload-help" className="text-sm text-muted-foreground">
          Please upload an Excel file (.xlsx) with the diet plan. Max file size: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.
        </p>
      <Button onClick={handleFileUpload} disabled={!selectedFile || isCurrentlyProcessing} className="w-full sm:w-auto">
        <UploadCloud className="mr-2 h-4 w-4" /> Upload and Process
      </Button>
    </div>
  );
};

export default FileUpload;
