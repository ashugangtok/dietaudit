
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor, calculateProcessedTableData, type ProcessedTableData } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES,
    SPECIAL_PIVOT_UOM_ROW_GROUPINGS,
    SPECIAL_PIVOT_UOM_COLUMN_FIELD,
    SPECIAL_PIVOT_UOM_VALUE_FIELD,
    PIVOT_BLANK_MARKER
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import InteractiveFilters from '@/components/InteractiveFilters';
import { ScrollArea } from '@/components/ui/scroll-area';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';


export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploadExcel");
  
  const [rawFileBase64, setRawFileBase64] = useState<string | null>(null);
  const [rawFileName, setRawFileName] = useState<string>("report");

  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);

  const [groupings, setGroupings] = useState<GroupingOption[]>(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
  const [summaries, setSummaries] = useState<SummarizationOption[]>(DEFAULT_IMAGE_PIVOT_SUMMARIES);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false); 

  const [isLoading, setIsLoading] = useState(false); 
  const [isFileSelected, setIsFileSelected] = useState(false); // True if a file is selected, but not necessarily parsed by server yet

  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow, filteredData } = useTableProcessor({ rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters });

  useEffect(() => {
    if (!isFileSelected || rawData.length === 0) {
        setHasAppliedFilters(false);
        setFilters([]); 
    }
  }, [isFileSelected, rawData]);


  const handleFileSelectedCallback = useCallback((base64Content: string, fileName: string) => {
    setIsLoading(true); // Indicates start of some processing (file reading locally is done by FileUpload)
    setRawFileBase64(base64Content);
    const cleanFileName = fileName.replace(/\.(xlsx|xls)$/i, '');
    setRawFileName(cleanFileName);

    setRawData([]);
    setAllHeaders([]);
    setFilters([]);
    setHasAppliedFilters(false);
    setIsFileSelected(true); // Mark file as selected
    setActiveTab("extractedData"); 

    toast({
        title: "File Selected",
        description: `"${cleanFileName}" is ready. Configure and apply filters to process and view data.`,
    });
    setIsLoading(false); // Done with this selection step
  }, [toast]);


  const handleApplyFiltersCallback = useCallback(async (newFilters: FilterOption[]) => {
    if (!isFileSelected || !rawFileBase64) { 
        toast({ variant: "destructive", title: "No File Selected", description: "Please select an Excel file first." });
        return;
    }
    
    setIsLoading(true); 
    
    try {
        // Parse the file now
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            // isFileSelected remains true, user can try applying filters again (which re-parses) or upload new file
            setIsLoading(false);
            return;
        }

        setRawData(result.parsedData);
        setAllHeaders(result.headers);

        // Logic to set default pivots based on headers (moved here from file selection)
        const requiredDefaultPivotCols = [
            ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
            ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
        ];
        const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => result.headers.includes(col as string));

        if (canApplyDefaultImagePivot) {
            setGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
            setSummaries(DEFAULT_IMAGE_PIVOT_SUMMARIES);
        } else {
            const canApplySpecialUOMPivot =
                SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => result.headers.includes(col as string)) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD as string) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD as string);

            if (canApplySpecialUOMPivot) {
                setGroupings(SPECIAL_PIVOT_UOM_ROW_GROUPINGS.map(col => ({ column: col as string })));
                setSummaries([{ column: SPECIAL_PIVOT_UOM_VALUE_FIELD as string, type: 'sum' }]);
            } else {
                 const fallbackGroupingCandidates = ['group_name', 'common_name', 'ingredient_name'];
                const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => result.headers.includes(h as string));
                setGroupings(availableFallbackGroupings.length > 0
                    ? availableFallbackGroupings.slice(0,2).map(col => ({ column: col as string }))
                    : result.headers.length > 0 ? [{ column: result.headers[0] }] : []);
                setSummaries((result.headers.includes('ingredient_qty'))
                    ? [{ column: 'ingredient_qty', type: 'sum' }]
                    : (result.headers.includes('total_animal'))
                        ? [{ column: 'total_animal', type: 'sum'}]
                        : []);
            }
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
                description: `"${rawFileName}" processed and data view updated based on your filter selection.`,
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
    if (processedData.length > 0 && currentTableColumns.length > 0 && hasAppliedFilters) {
      exportToPdf(processedData, currentTableColumns, `Full Diet Report - ${rawFileName}`, `${rawFileName}_full_report`, grandTotalRow);
      toast({ title: "PDF Download Started", description: "Your full report PDF is being generated." });
    } else {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export. Apply filters to view data first." });
    }
  };

  const handleDownloadSectionPdf = (sectionName: string, sectionTableData: ProcessedTableData) => {
     if (sectionTableData.processedData.length > 0 && sectionTableData.columns.length > 0 && hasAppliedFilters) {
      exportToPdf(sectionTableData.processedData, sectionTableData.columns, `Section Report: ${sectionName}`, `${rawFileName}_section_${sectionName.replace(/\s+/g, '_')}`, sectionTableData.grandTotalRow);
      toast({ title: "PDF Download Started", description: `PDF for section ${sectionName} is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: `No data available to export for section ${sectionName}. Ensure filters are applied.` });
    }
  };


  const year = new Date().getFullYear();

  const renderContentForDataTabs = (isExportTab: boolean) => {
    if (isLoading) {
      return (
        <Card>
          <CardHeader><CardTitle>Processing...</CardTitle><CardDescription>Working on your request, please wait.</CardDescription></CardHeader>
          <CardContent className="p-6 space-y-4 flex flex-col items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">This may take a moment, especially for large files...</p>
          </CardContent>
        </Card>
      );
    }

    if (!isFileSelected) {
      return (
        <Card><CardContent className="p-6 text-center text-muted-foreground"><p>Please upload an Excel file to begin.</p></CardContent></Card>
      );
    }

    // File is selected, but filters (and thus parsing) haven't been applied by the user yet
    if (isFileSelected && !hasAppliedFilters) {
      return (
        <Card className="flex-1">
          <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
            <FileSpreadsheet className="h-12 w-12 text-primary/50 mb-4" />
            <p>File "<strong>{rawFileName || 'selected file'}</strong>" is selected.</p>
            <p>Please configure and click "Apply Filters" to process and view the data table.</p>
            <p className="text-xs mt-2">(Filter options will populate after initial processing via 'Apply Filters'.)</p>
          </CardContent>
        </Card>
      );
    }
    
    // hasAppliedFilters is true from here AND isFileSelected is true (meaning parsing was attempted/successful)

    if (rawData.length === 0 && allHeaders.length > 0) { 
         return (
             <Card className="flex-1">
                <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="font-semibold">File Contains Only Headers</p>
                    <p>The uploaded file "<strong>{rawFileName}</strong>" appears to have headers but no data rows.</p>
                </CardContent>
            </Card>
        );
    }
    
    if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) { // Parsed, but no data/headers
         return (
             <Card className="flex-1">
                <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                    <FileSpreadsheet className="h-12 w-12 text-destructive/50 mb-4" />
                    <p className="font-semibold">No Data Extracted</p>
                    <p>Could not extract any data or headers from "<strong>{rawFileName}</strong>" after processing. The file might be empty, in an unsupported format, or a parsing error occurred.</p>
                </CardContent>
            </Card>
        );
    }

    if (processedData.length === 0 && rawData.length > 0 && hasAppliedFilters ) { 
       return (
          <Card className="flex-1">
            <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
              <p className="font-semibold">No Data Matches Filters</p>
              <p>Your filter selection for "<strong>{rawFileName}</strong>" resulted in no data.</p>
              <p>Please try adjusting your filters.</p>
            </CardContent>
          </Card>
        );
    }
    
    if (isExportTab) {
      return (
        <>
          <div className="flex justify-end mb-2">
            <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || processedData.length === 0 || !hasAppliedFilters}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
               Download All as PDF
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-6">
              {filteredData.length > 0 && 
                [...new Set(filteredData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER))].sort().map((sectionName) => {
                  const rawDataForThisSection = rawData.filter(row => {
                    const sectionMatch = String(row.section_name || '').trim() === sectionName;
                    if (!sectionMatch) return false;
                     return filters.every(filter => {
                        const rowValue = calculateProcessedTableData([row], [], [], [filter], allHeaders, true).filteredData[0]?.[filter.column];
                         const filterValue = filter.value;
                         const normalizedRowValue = String(rowValue ?? '').toLowerCase();
                        if (rowValue === undefined || rowValue === null || String(rowValue).trim() === '') {
                             return filter.type === 'equals' && (filterValue === '' || filterValue === null);
                        }
                        switch (filter.type) {
                          case 'equals': return normalizedRowValue === String(filterValue).toLowerCase();
                          case 'contains': if (filterValue === '') return true; return normalizedRowValue.includes(String(filterValue).toLowerCase());
                          case 'in': return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(normalizedRowValue);
                          case 'range_number':
                            if (Array.isArray(filterValue) && filterValue.length === 2) {
                              const [min, max] = filterValue.map(v => parseFloat(String(v)));
                              const numericRowValue = parseFloat(String(rowValue));
                              if (isNaN(numericRowValue)) return false;
                              const minCheck = isNaN(min) || numericRowValue >= min;
                              const maxCheck = isNaN(max) || numericRowValue <= max;
                              return minCheck && maxCheck;
                            }
                            return true;
                          default: return true;
                        }
                    });
                  });
                  
                  const sectionTableData: ProcessedTableData = calculateProcessedTableData( rawDataForThisSection, groupings, summaries, [], allHeaders, true );

                  if (sectionTableData.processedData.length === 0) {
                      return (
                          <Card key={sectionName}>
                              <CardHeader className="flex flex-row items-center justify-between">
                                  <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                                   <Button onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} size="sm" variant="outline" disabled={true}>
                                    <Download className="mr-2 h-4 w-4" /> PDF
                                  </Button>
                              </CardHeader>
                              <CardContent><p className="text-muted-foreground">No data matches the current global filters for this section.</p></CardContent>
                          </Card>
                      );
                  }
                  return (
                    <Card key={sectionName} className="overflow-hidden">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                        <Button onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} size="sm" variant="outline" disabled={isLoading || sectionTableData.processedData.length === 0 || !hasAppliedFilters}>
                          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="min-h-0 pt-0">
                         <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}> 
                          <DataTable data={sectionTableData.processedData} columns={sectionTableData.columns} grandTotalRow={sectionTableData.grandTotalRow}/>
                         </div>
                      </CardContent>
                    </Card>
                  );
              })}
              
               {filteredData.length > 0 && ![...new Set(filteredData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER))].length && (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                        <AlertCircle className="h-12 w-12 text-primary/50 mb-4" />
                        <p className="font-semibold">No Sections Found in Filtered Data</p>
                        <p>The current filter selection for "<strong>{rawFileName}</strong>" resulted in data, but no 'section_name' values were found.</p>
                    </CardContent>
                 </Card>
               )}
                {filteredData.length === 0 && rawData.length > 0 && hasAppliedFilters && (
                    <Card>
                        <CardContent className="p-6 text-center text-muted-foreground">
                            <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto mb-4" />
                            <p className="font-semibold">No Data Matches Current Filters for Section Export</p>
                        </CardContent>
                    </Card>
                )}
            </div>
          </ScrollArea>
        </>
      );
    } else {
      return (
        <div className="flex-1 min-h-0">
          <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
        </div>
      );
    }
  };


  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <DietWiseLogo />
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">Help</Button>
            <Button variant="ghost" size="sm">Settings</Button>
        </div>
      </header>
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-3">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><FileSpreadsheet className="h-4 w-4"/>Upload Excel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto">
            <div className="container mx-auto flex flex-col items-center justify-center space-y-8 py-10">
              {!isFileSelected && !isLoading && (
                <div className="text-center space-y-4">
                  <Leaf className="mx-auto h-24 w-24 text-primary" />
                  <h1 className="text-4xl font-bold">DietWise</h1>
                  <p className="text-muted-foreground text-lg">
                    Upload your animal diet plan Excel file to unlock valuable insights.
                  </p>
                </div>
              )}
              <Card className="w-full max-w-2xl shadow-lg">
                <CardHeader>
                  <CardTitle>Upload Diet Plan</CardTitle>
                  <CardDescription>Select an Excel file to begin analysis.</CardDescription>
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
          </TabsContent>

          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                <InteractiveFilters
                    rawData={rawData} 
                    allHeaders={allHeaders} 
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected} 
                />
                {renderContentForDataTabs(false)}
            </div>
          </TabsContent>

          <TabsContent value="exportSections" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <InteractiveFilters
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected}
                />
                {renderContentForDataTabs(true)}
              </div>
          </TabsContent>
        </Tabs>
      </div>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-auto">
        <div className="container mx-auto">
          DietWise &copy; {year}
        </div>
      </footer>
    </main>
  );
}
    
