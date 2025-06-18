"use client";

import type React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { DietDataRow } from '@/types';
import { UploadCloud } from 'lucide-react';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

interface FileUploadProps {
  onDataParsed: (data: DietDataRow[], headers: string[]) => void;
  onProcessing: (isProcessing: boolean) => void;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit

// IMPORTANT: Replace with your Firebase project configuration
// Ensure these are set up, potentially via environment variables
// e.g., process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | null = null;
try {
  if (firebaseConfig.projectId) { // Check if projectId is available
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    console.warn("Firebase projectId is not configured. File uploads to Firebase Storage will not work.");
  }
} catch (error) {
  console.error("Error initializing Firebase App for FileUpload:", error);
  // Prevent further errors if firebaseApp is not initialized
  firebaseApp = null; 
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

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `Please upload a file smaller than ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
        });
        setSelectedFile(null);
        setFileName("No file chosen");
        if(fileInputRef.current) {
            fileInputRef.current.value = ''; 
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
            fileInputRef.current.value = '';
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

    if (!firebaseApp) {
      toast({
        variant: "destructive",
        title: "Firebase Not Configured",
        description: "Firebase is not properly configured. Cannot upload file to Storage.",
      });
      console.error("Firebase app is not initialized in FileUpload. Cannot proceed with storage upload.");
      return;
    }
    
    setIsCurrentlyProcessing(true);
    onProcessing(true); 
    
    try {
      const storage = getStorage(firebaseApp);
      // Create a unique file path, e.g., excel-uploads/some-random-id/original-file-name.xlsx
      const uniqueId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const filePath = `excel-uploads/${uniqueId}/${selectedFile.name}`;
      const fileStorageRef = storageRef(storage, filePath);

      toast({
        title: "Uploading File...",
        description: "Your file is being uploaded to secure storage.",
      });

      await uploadBytes(fileStorageRef, selectedFile);
      
      // No need for downloadURL if sending path directly to backend.
      // const downloadURL = await getDownloadURL(fileStorageRef); 

      toast({
        title: "Processing File...",
        description: "File uploaded. Now extracting data on the server.",
      });

      const result = await parseExcelFlow({ storageFilePath: filePath, originalFileName: selectedFile.name });

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
      console.error("Error during file upload or processing:", error);
      toast({
        variant: "destructive",
        title: "Error During Upload/Processing",
        description: error instanceof Error ? error.message : "An unknown error occurred. Please check console for details.",
      });
      onDataParsed([], []); 
    } finally {
      setIsCurrentlyProcessing(false);
      onProcessing(false); 
    }
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
          Please upload an Excel file (.xlsx or .xls). Max file size: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.
        </p>
      <Button onClick={handleFileUpload} disabled={!selectedFile || isCurrentlyProcessing || !firebaseApp} className="w-full sm:w-auto">
        <UploadCloud className="mr-2 h-4 w-4" /> Upload and Process
      </Button>
      {!firebaseApp && (
        <p className="text-xs text-destructive">Firebase is not configured. File upload is disabled.</p>
      )}
    </div>
  );
};

export default FileUpload;