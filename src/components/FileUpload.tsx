
"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFileSelected: (base64Content: string, fileName: string) => void; // Changed back from Promise<void>
  onProcessing: (isProcessing: boolean) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelected, onProcessing, disabled }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileNameDisplay, setFileNameDisplay] = useState<string>("No file chosen");
  const [isReadingFileLocally, setIsReadingFileLocally] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];

      if (file.size > MAX_FILE_SIZE) {
        toast({
            variant: "destructive",
            title: "File Too Large",
            description: `Please select a file smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        });
        setSelectedFile(null);
        setFileNameDisplay("No file chosen");
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        return;
      }
      
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

  const handleFileReadAndPassUp = async () => { // Still async due to FileReader, but onFileSelected is sync
    if (!selectedFile) {
      toast({
        variant: "destructive",
        title: "No File Selected",
        description: "Please select an Excel file to upload.",
      });
      return;
    }

    setIsReadingFileLocally(true);
    onProcessing(true); // Parent's general processing starts

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = (e) => { // Removed async here as onFileSelected is sync
        try {
          const base64String = e.target?.result as string;
          const actualBase64 = base64String.substring(base64String.indexOf(',') + 1);
          onFileSelected(actualBase64, selectedFile.name); // Call synchronous prop
        } catch (readError) {
          console.error("Error processing file after read or in onFileSelected:", readError);
          toast({
            variant: "destructive",
            title: "Error Processing File Data",
            description: readError instanceof Error ? readError.message : "An unknown error occurred while preparing file data.",
          });
        } finally {
          setIsReadingFileLocally(false);
          // Parent (page.tsx) will call onProcessing(false) after its own processing (including server parse) completes or fails.
        }
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        toast({
          variant: "destructive",
          title: "File Read Error",
          description: "Could not read the selected file.",
        });
        setIsReadingFileLocally(false);
        onProcessing(false); // FileReader error, so parent processing stops
      };
    } catch (error) {
      console.error("Error setting up file read:", error);
      toast({
        variant: "destructive",
        title: "Setup Error",
        description: "An unexpected error occurred before reading the file.",
      });
      setIsReadingFileLocally(false);
      onProcessing(false); // Setup error, so parent processing stops
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Button onClick={triggerFileInput} variant="outline" className="cursor-pointer" disabled={isReadingFileLocally || disabled}>
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
          disabled={isReadingFileLocally || disabled}
        />
        <span className="text-sm text-muted-foreground truncate" style={{maxWidth: '200px'}}>{fileNameDisplay}</span>
      </div>
       <p id="file-upload-help" className="text-sm text-muted-foreground">
          Please upload an Excel file (.xlsx or .xls).
        </p>
      <Button onClick={handleFileReadAndPassUp} disabled={!selectedFile || isReadingFileLocally || disabled} className="w-full sm:w-auto">
        {(disabled && !isReadingFileLocally ) ? ( 
           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isReadingFileLocally ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="mr-2 h-4 w-4" />
        )}
        {isReadingFileLocally ? "Reading File..." : (disabled && !isReadingFileLocally) ? "Processing..." : "Confirm & Select File"}
      </Button>
      {isReadingFileLocally && ( 
        <div className="space-y-2 pt-2">
          <Progress value={50} className="w-full" /> 
          <p className="text-sm text-muted-foreground text-center">Reading file locally, please wait...</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
    
