
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { FileSpreadsheet, AlertCircle, FileSearch, TableIcon, Download, Loader2, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES,
    PIVOT_BLANK_MARKER,
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import SimpleFilterPanel from '@/components/SimpleFilterPanel';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';


export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploadExcel");

  const [rawFileBase64, setRawFileBase64] = useState<string | null>(null);
  const [rawFileName, setRawFileName] = useState<string>("report");

  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);

  const [defaultGroupings, setDefaultGroupings] = useState<GroupingOption[]>(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
  const [defaultSummaries, setDefaultSummaries] = useState<SummarizationOption[]>(DEFAULT_IMAGE_PIVOT_SUMMARIES);

  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isFileSelected, setIsFileSelected] = useState(false);

  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow } = useTableProcessor({
    rawData,
    groupings: defaultGroupings,
    summaries: defaultSummaries,
    filters,
    allHeaders,
    hasAppliedFilters
  });


  useEffect(() => {
    if (!isFileSelected || rawData.length === 0) {
        setHasAppliedFilters(false);
        setFilters([]);
    }
  }, [isFileSelected, rawData]);


  const handleFileSelectedCallback = useCallback((base64Content: string, fileName: string) => {
    setIsLoading(true);
    setRawFileBase64(base64Content);
    const cleanFileName = fileName.replace(/\.(xlsx|xls)$/i, '');
    setRawFileName(cleanFileName);

    setRawData([]);
    setAllHeaders([]);
    setFilters([]);
    setHasAppliedFilters(false);
    setIsFileSelected(true);
    setActiveTab("uploadExcel");

    toast({
        title: "File Ready for Processing",
        description: `"${cleanFileName}" selected. Apply filters on other tabs to view data.`,
    });
    setIsLoading(false);
  }, [toast]);


  const handleApplyFiltersCallback = useCallback(async (newFilters: FilterOption[]) => {
    if (!isFileSelected || !rawFileBase64) {
        toast({ variant: "destructive", title: "No File Selected", description: "Please select an Excel file first." });
        return;
    }

    setIsLoading(true);

    try {
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            setIsLoading(false);
            return;
        }
        
        setRawData(result.parsedData);
        setAllHeaders(result.headers);

        const requiredDefaultPivotCols = [
            ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
            ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
        ];
         if (result.headers.includes('base_uom_name') && !DEFAULT_IMAGE_PIVOT_SUMMARIES.find(s => s.column === 'base_uom_name')) {
            requiredDefaultPivotCols.push('base_uom_name');
        }
         if (result.headers.includes('animal_id') && !requiredDefaultPivotCols.includes('animal_id')) {
            requiredDefaultPivotCols.push('animal_id');
        }


        const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => result.headers.includes(col as string));

        if (canApplyDefaultImagePivot) {
            setDefaultGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
            
            const currentViewSummaries = [...DEFAULT_IMAGE_PIVOT_SUMMARIES];
            if (result.headers.includes('base_uom_name') && !currentViewSummaries.find(s => s.column === 'base_uom_name')) {
                currentViewSummaries.push({ column: 'base_uom_name', type: 'first'});
            }

            const totalAnimalSummaryIndex = currentViewSummaries.findIndex(s => s.column === 'total_animal');
            if (totalAnimalSummaryIndex !== -1) {
                 currentViewSummaries[totalAnimalSummaryIndex].type = 'first';
            } else if (result.headers.includes('total_animal') && result.headers.includes('animal_id')) {
                currentViewSummaries.push({ column: 'total_animal', type: 'first'});
            }
            setDefaultSummaries(currentViewSummaries);

        } else {
            const fallbackGroupingCandidates = ['group_name', 'common_name', 'diet_name', 'type_name', 'ingredient_name', 'meal_start_time', 'section_name', 'site_name'];
            const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => result.headers.includes(h as string));
            setDefaultGroupings(availableFallbackGroupings.length > 0
                ? availableFallbackGroupings.slice(0,5).map(col => ({ column: col as string })) 
                : result.headers.length > 0 ? [{ column: result.headers[0] }] : []);

            const fallbackSummaries: SummarizationOption[] = [];
            if (result.headers.includes('ingredient_qty')) fallbackSummaries.push({ column: 'ingredient_qty', type: 'first' });
            if (result.headers.includes('base_uom_name')) fallbackSummaries.push({ column: 'base_uom_name', type: 'first'});
            if (result.headers.includes('total_animal') && result.headers.includes('animal_id')) {
                fallbackSummaries.push({ column: 'total_animal', type: 'first'});
            } else if (result.headers.includes('total_animal')) {
                 fallbackSummaries.push({ column: 'total_animal', type: 'first'}); 
            }


            if (fallbackSummaries.length === 0 && result.parsedData.length > 0 && result.headers.length > 0) {
                const firstDataRow = result.parsedData[0];
                const someNumericHeader = result.headers.find(h => typeof firstDataRow[h] === 'number' && !fallbackSummaries.some(s => s.column === h));
                if (someNumericHeader) fallbackSummaries.push({column: someNumericHeader, type: 'sum'});
                else if (result.headers.length > 0 && !fallbackSummaries.find(s=>s.column === result.headers[0])) {
                     fallbackSummaries.push({column: result.headers[0], type: 'count'});
                }
            }
            setDefaultSummaries(fallbackSummaries);
        }

        setFilters(newFilters);
        setHasAppliedFilters(true);

        if (result.parsedData.length === 0 && result.headers.length > 0) {
            toast({ variant: "default", title: "File Parsed: Contains Only Headers", description: "The Excel file seems to contain only headers and no data rows. Filters applied."});
        } else if (result.parsedData.length === 0 && result.headers.length === 0 ) {
            toast({ variant: "destructive", title: "No Data Extracted", description: "Could not extract any data or headers from the file. Please check the file format."});
        } else {
             toast({
                title: "Filters Applied, Data Processed",
                description: `"${rawFileName}" processed. You can now view the data.`,
            });
        }

    } catch (error) {
        console.error("Error during 'Apply Filters' (including parsing):", error);
        toast({ variant: "destructive", title: "Processing Error", description: "An unexpected error occurred while parsing or filtering the file." });
        setRawData([]);
        setAllHeaders([]);
    } finally {
        setIsLoading(false);
    }
  }, [isFileSelected, rawFileBase64, rawFileName, toast]);


  const handleDownloadAllPdf = () => {
    let dataToExport: DietDataRow[] = [];
    let columnsToExport: string[] = [];
    let grandTotalToExport: DietDataRow | undefined = undefined;
    let reportTitleSuffix = "Report";
    let isViewDataForPdf = false;

    if (activeTab === "extractedData" || activeTab === "audit") {
        dataToExport = processedData.map(row => ({...row})); 
        columnsToExport = [...currentTableColumns];
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined; 
        reportTitleSuffix = activeTab === "extractedData" ? "Full Diet Report" : "Audit Report";
        isViewDataForPdf = true; 
    }

    const uomKey = columnsToExport.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));
    const ingredientQtyFirstKey = columnsToExport.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_first'));
    const totalQtyRequiredKey = columnsToExport.find(k => k === 'total_qty_required_calculated');


    if (uomKey && (ingredientQtyFirstKey || totalQtyRequiredKey) && allHeaders.includes('base_uom_name')) {
        dataToExport = dataToExport.map(row => {
            const newRow = {...row};
            if (ingredientQtyFirstKey) {
                const qtyPerAnimal = newRow[ingredientQtyFirstKey];
                const uom = row[uomKey];
                if (typeof qtyPerAnimal === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                    newRow[ingredientQtyFirstKey] = `${qtyPerAnimal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                }
            }
            if (totalQtyRequiredKey) {
                const totalQty = newRow[totalQtyRequiredKey];
                const uom = row[uomKey]; // Assume UoM is consistent
                if (typeof totalQty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                    newRow[totalQtyRequiredKey] = `${totalQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                }
            }
            return newRow;
        });

        if (grandTotalToExport) {
            if (ingredientQtyFirstKey && typeof grandTotalToExport[ingredientQtyFirstKey] === 'number') {
                const qty = grandTotalToExport[ingredientQtyFirstKey] as number;
                const uom = grandTotalToExport[uomKey];
                if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                    grandTotalToExport[ingredientQtyFirstKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                }
            }
            if (totalQtyRequiredKey && typeof grandTotalToExport[totalQtyRequiredKey] === 'number') {
                const qty = grandTotalToExport[totalQtyRequiredKey] as number;
                const uom = grandTotalToExport[uomKey]; // Assume UoM is consistent
                if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                    grandTotalToExport[totalQtyRequiredKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
                }
            }
        }
        
        // Only remove UoM if it's not the primary quantity display (e.g., if we have separate Qty/Animal and Total Qty columns)
        if (uomKey && (ingredientQtyFirstKey || totalQtyRequiredKey) && (ingredientQtyFirstKey !== uomKey && totalQtyRequiredKey !== uomKey)) {
            columnsToExport = columnsToExport.filter(c => c !== uomKey);
        }
    }
    
    if (dataToExport.length > 0 && columnsToExport.length > 0 && hasAppliedFilters) {
      exportToPdf(dataToExport, columnsToExport, `${reportTitleSuffix} - ${rawFileName}`, `${rawFileName}_${activeTab}_report`, grandTotalToExport, isViewDataForPdf, allHeaders);
      toast({ title: "PDF Download Started", description: `Your ${reportTitleSuffix} PDF is being generated.` });
    } else if (hasAppliedFilters && dataToExport.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export for the current filters." });
    } else {
      toast({ variant: "destructive", title: "No Data", description: "Apply filters to process data before exporting." });
    }
  };

  const year = new Date().getFullYear();

  const renderContentForDataTabs = () => {
    if (isLoading) {
      return (
        <Card><CardHeader><CardTitle>Processing...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
      );
    }

    if (!isFileSelected) {
      return (
         <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-10">
            <DietWiseLogo className="w-48 h-auto mb-2" />
            <p className="text-muted-foreground text-lg max-w-md">
                Upload your animal diet plan Excel file for analysis and comparison.
            </p>
            <Card className="w-full max-w-lg shadow-xl bg-card/90 backdrop-blur-sm">
                <CardHeader>
                <CardTitle className="text-2xl">Upload Diet Plan</CardTitle>
                <CardDescription>Select an Excel file (.xlsx, .xls) to begin.</CardDescription>
                </CardHeader>
                <CardContent>
                <FileUpload
                    onFileSelected={handleFileSelectedCallback}
                    onProcessing={setIsLoading}
                    disabled={isLoading}
                />
                </CardContent>
            </Card>
        </div>
      );
    }

    if (isFileSelected && !hasAppliedFilters && activeTab !== "uploadExcel") {
      return (
        <Card className="flex-1">
          <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
            <FileSpreadsheet className="h-12 w-12 text-primary/50 mb-4" />
            <p>File "<strong>{rawFileName || 'selected file'}</strong>" is selected.</p>
            <p>Please click "Apply Filters" to process and view the data.</p>
          </CardContent>
        </Card>
      );
    }

    if (rawData.length === 0 && allHeaders.length > 0 && hasAppliedFilters) {
        return <Card><CardContent className="p-6 text-center text-muted-foreground">File "<strong>{rawFileName}</strong>" contains only headers.</CardContent></Card>;
    }
    if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) {
        return <Card><CardContent className="p-6 text-center text-destructive">No data or headers extracted from "<strong>{rawFileName}</strong>".</CardContent></Card>;
    }
    
    if (processedData.length === 0 && rawData.length > 0 && hasAppliedFilters) {
       return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the current view.</CardContent></Card>;
    }

    return (
      <div className="flex-1 min-h-0">
         <div className="flex justify-end mb-2">
           <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || processedData.length === 0 || !hasAppliedFilters}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
          </Button>
        </div>
        <DataTable
          data={processedData}
          columns={currentTableColumns}
          grandTotalRow={grandTotalRow}
          allHeaders={allHeaders}
          isViewDataTab={true} 
        />
      </div>
    );
  };


  return (
    <main className="min-h-screen text-foreground flex flex-col bg-transparent">
      <header className="px-4 py-3 border-b flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <DietWiseLogo />
      </header>
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><UploadCloud className="h-4 w-4"/>Upcel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="audit" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><FileSearch className="h-4 w-4"/>Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto flex items-center justify-center">
             {renderContentForDataTabs()}
          </TabsContent>

          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                <SimpleFilterPanel
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected}
                />
                {renderContentForDataTabs()}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <SimpleFilterPanel
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected}
                />
                {renderContentForDataTabs()}
              </div>
          </TabsContent>
        </Tabs>
      </div>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-auto bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto">
          DietWise &copy; {year}
        </div>
      </footer>
    </main>
  );
}
    
    