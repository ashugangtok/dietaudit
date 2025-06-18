
"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { DietDataRow } from '@/types';
import { UploadCloud, Loader2 } from 'lucide-react';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';

interface FileUploadProps {
  onDataParsed: (data: DietDataRow[], headers: string[], fileName: string) => void;
  onProcessing: (isProcessing: boolean) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed, onProcessing }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileNameDisplay, setFileNameDisplay] = useState<string>("No file chosen");
  const [isCurrentlyProcessing, setIsCurrentlyProcessing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        setFileNameDisplay(file.name);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an Excel file (.xlsx or .xls).",
        });
        setSelectedFile(null);
        setFileNameDisplay("No file chosen");
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
      }
    } else {
      setSelectedFile(null);
      setFileNameDisplay("No file chosen");
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
    const originalFileNameForParsing = selectedFile.name;

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async (e) => {
        try {
          const base64String = e.target?.result as string;
          const actualBase64 = base64String.substring(base64String.indexOf(',') + 1);

          toast({
            title: "Processing File...",
            description: "Extracting data on the server. This may take a moment for large files.",
          });
          
          const result = await parseExcelFlow({ excelFileBase64: actualBase64, originalFileName: originalFileNameForParsing });

          if (result.error) {
            toast({
              variant: "destructive",
              title: "File Processing Error",
              description: result.error,
            });
            onDataParsed([], [], originalFileNameForParsing);
            setIsCurrentlyProcessing(false);
            onProcessing(false);
            return; 
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
          onDataParsed(result.parsedData, result.headers, originalFileNameForParsing);
        } catch (processError) {
          console.error("Error during server-side processing:", processError);
          toast({
            variant: "destructive",
            title: "Error During Processing",
            description: processError instanceof Error ? processError.message : "An unknown error occurred on the server.",
          });
          onDataParsed([], [], originalFileNameForParsing);
        } finally {
          setIsCurrentlyProcessing(false);
          onProcessing(false);
        }
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        toast({
          variant: "destructive",
          title: "File Read Error",
          description: "Could not read the selected file.",
        });
        setIsCurrentlyProcessing(false);
        onProcessing(false);
        onDataParsed([], [], originalFileNameForParsing);
      };
    } catch (error) {
      console.error("Error setting up file read:", error);
      toast({
        variant: "destructive",
        title: "Setup Error",
        description: "An unexpected error occurred before processing the file.",
      });
      setIsCurrentlyProcessing(false);
      onProcessing(false);
      onDataParsed([], [], originalFileNameForParsing);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Button onClick={triggerFileInput} variant="outline" className="cursor-pointer" disabled={isCurrentlyProcessing}>
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
          disabled={isCurrentlyProcessing}
        />
        <span className="text-sm text-muted-foreground truncate" style={{maxWidth: '200px'}}>{fileNameDisplay}</span>
      </div>
       <p id="file-upload-help" className="text-sm text-muted-foreground">
          Please upload an Excel file (.xlsx or .xls).
        </p>
      <Button onClick={handleFileUpload} disabled={!selectedFile || isCurrentlyProcessing} className="w-full sm:w-auto">
        {isCurrentlyProcessing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="mr-2 h-4 w-4" />
        )}
        {isCurrentlyProcessing ? "Processing..." : "Upload and Process"}
      </Button>
      {isCurrentlyProcessing && (
        <div className="space-y-2 pt-2">
          <Progress value={50} className="w-full" /> 
          <p className="text-sm text-muted-foreground text-center">Processing file, please wait...</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;

