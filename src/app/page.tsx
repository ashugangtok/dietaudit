
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';


export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploadExcel");
  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);

  const [groupings, setGroupings] = useState<GroupingOption[]>(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
  const [summaries, setSummaries] = useState<SummarizationOption[]>(DEFAULT_IMAGE_PIVOT_SUMMARIES);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [originalFileName, setOriginalFileName] = useState<string>("report");
  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow, filteredData } = useTableProcessor({ rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters });

  useEffect(() => {
    if (!isFileUploaded) {
        setHasAppliedFilters(false);
    }
  }, [isFileUploaded]);

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[], uploadedFileName: string) => {
    setRawData(data);
    setAllHeaders(headers);
    setIsProcessingFile(false);
    setIsFileUploaded(true);
    setActiveTab("extractedData");
    setFilters([]);
    setHasAppliedFilters(false); 
    setOriginalFileName(uploadedFileName.replace(/\.(xlsx|xls)$/i, ''));


    const requiredDefaultPivotCols = [
        ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
        ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
    ];
    const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => headers.includes(col as string));

    if (canApplyDefaultImagePivot) {
        setGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
        setSummaries(DEFAULT_IMAGE_PIVOT_SUMMARIES);
        if (data.length > 0) {
            toast({
                title: "Default Pivot View Ready",
                description: "Table configured with standard pivot. Apply filters to view.",
            });
        }
    } else {
        const canApplySpecialUOMPivot =
            SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => headers.includes(col as string)) &&
            headers.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD as string) &&
            headers.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD as string);

        if (canApplySpecialUOMPivot) {
            const uomPivotGroupings: GroupingOption[] = SPECIAL_PIVOT_UOM_ROW_GROUPINGS.map(col => ({ column: col as string }));
            setGroupings(uomPivotGroupings);
            const uomPivotSummaries: SummarizationOption[] = [{ column: SPECIAL_PIVOT_UOM_VALUE_FIELD as string, type: 'sum' }];
            setSummaries(uomPivotSummaries);
            if (data.length > 0) {
                toast({
                    title: "Diet Analysis by UOM View Prepared",
                    description: "Table configured for UOM analysis. Apply filters to view.",
                });
            }
        } else {
            const fallbackGroupingCandidates = ['group_name', 'common_name', 'ingredient_name'];
            const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => headers.includes(h as string));
            const fallbackGroupings: GroupingOption[] = availableFallbackGroupings.length > 0
                ? availableFallbackGroupings.slice(0,2).map(col => ({ column: col as string }))
                : headers.length > 0 ? [{ column: headers[0] }] : [];
            setGroupings(fallbackGroupings);

            const fallbackSummaries: SummarizationOption[] = (headers.includes('ingredient_qty'))
                ? [{ column: 'ingredient_qty', type: 'sum' }]
                 : (headers.includes('total_animal'))
                    ? [{ column: 'total_animal', type: 'sum'}]
                    : [];
            setSummaries(fallbackSummaries);
            if (data.length > 0) {
                 toast({
                    title: "Data Loaded, Basic View Prepared",
                    description: "Default pivot configuration could not be fully applied. Apply filters to view.",
                    variant: "default"
                });
            }
        }
    }
     if (data.length === 0 && headers.length > 0) {
        // Handled by toast in FileUpload or if no specific pivot applied.
    } else if (data.length === 0 && headers.length === 0) {
        // Handled by FileUpload.
    }

  }, [toast]);

  const handleApplyFiltersCallback = useCallback((newFilters: FilterOption[]) => {
    setFilters(newFilters);
    setHasAppliedFilters(true);
  }, []);

  const handleDownloadAllPdf = () => {
    if (processedData.length > 0 && currentTableColumns.length > 0) {
      exportToPdf(processedData, currentTableColumns, `Full Diet Report - ${originalFileName}`, `${originalFileName}_full_report`, grandTotalRow);
      toast({ title: "PDF Download Started", description: "Your full report PDF is being generated." });
    } else {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export." });
    }
  };

  const handleDownloadSectionPdf = (sectionName: string, sectionTableData: ProcessedTableData) => {
     if (sectionTableData.processedData.length > 0 && sectionTableData.columns.length > 0) {
      exportToPdf(sectionTableData.processedData, sectionTableData.columns, `Section Report: ${sectionName} - ${originalFileName}`, `${originalFileName}_section_${sectionName.replace(/\s+/g, '_')}`, sectionTableData.grandTotalRow);
      toast({ title: "PDF Download Started", description: `PDF for section ${sectionName} is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: `No data available to export for section ${sectionName}.` });
    }
  };


  const year = new Date().getFullYear();

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
            <TabsTrigger value="extractedData" disabled={!isFileUploaded && !isProcessingFile} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileUploaded && !isProcessingFile} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto">
            <div className="container mx-auto flex flex-col items-center justify-center space-y-8 py-10">
              {!isFileUploaded && (
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
                    onDataParsed={(data, headers, fileName) => handleDataParsed(data, headers, fileName)} 
                    onProcessing={setIsProcessingFile} 
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0">
            {isProcessingFile && (
              <Card>
                <CardHeader><CardTitle>Processing File...</CardTitle><CardDescription>Extracting data, please wait.</CardDescription></CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-6 w-48" /></div>
                    <Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-4 w-full mt-4" /><Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            )}
            {!isProcessingFile && isFileUploaded && (
              <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                <InteractiveFilters
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                />
                 {hasAppliedFilters && rawData.length > 0 && processedData.length > 0 && (
                  <div className="flex justify-end mb-2">
                    <Button onClick={handleDownloadAllPdf} size="sm">
                      <Download className="mr-2 h-4 w-4" /> Download All as PDF
                    </Button>
                  </div>
                )}
                {!hasAppliedFilters && rawData.length > 0 && (
                  <Card className="flex-1">
                    <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                      <p>Please configure your filters and click "Apply Filters" to view the data.</p>
                    </CardContent>
                  </Card>
                )}
                {hasAppliedFilters && rawData.length > 0 && processedData.length > 0 && (
                  <div className="flex-1 min-h-0">
                    <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
                  </div>
                )}
                {hasAppliedFilters && rawData.length > 0 && processedData.length === 0 && (
                  <Card className="flex-1">
                    <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                        <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
                      <p className="font-semibold">No Data Matches Filters</p>
                      <p>Your filter selection resulted in no data.</p>
                      <p>Please try adjusting your filters or upload a new file.</p>
                    </CardContent>
                  </Card>
                )}
                {rawData.length === 0 && isFileUploaded && !isProcessingFile && (
                     <Card className="flex-1">
                        <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="font-semibold">No Data in File</p>
                            <p>No data found in the uploaded file, or the file only contains headers.</p>
                            <p>Please try uploading a different file.</p>
                        </CardContent>
                    </Card>
                )}
              </div>
            )}
            {!isProcessingFile && !isFileUploaded && (
                 <Card><CardContent className="p-6 text-center text-muted-foreground"><p>Please upload an Excel file to view data.</p></CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="exportSections" className="mt-2 flex flex-col flex-1 min-h-0">
             {isProcessingFile && (
              <Card>
                <CardHeader><CardTitle>Processing File...</CardTitle><CardDescription>Please wait until processing is complete.</CardDescription></CardHeader>
                <CardContent className="p-6 space-y-4"><div className="flex items-center space-x-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-6 w-48" /></div><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></CardContent>
              </Card>
            )}
            {!isProcessingFile && isFileUploaded && (
              <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <InteractiveFilters
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                />
                {!hasAppliedFilters && rawData.length > 0 && (
                  <Card className="flex-1">
                    <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                      <p>Please configure your filters and click "Apply Filters" to view the data for export.</p>
                    </CardContent>
                  </Card>
                )}
                {hasAppliedFilters && rawData.length > 0 && (
                  <ScrollArea className="flex-1">
                    <div className="space-y-6">
                      {filteredData.length > 0 && 
                        [...new Set(filteredData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER))].sort().map((sectionName) => {
                          const rawDataForThisSection = rawData.filter(row => String(row.section_name || '').trim() === sectionName);
                          
                          const sectionTableData: ProcessedTableData = calculateProcessedTableData(
                              rawDataForThisSection, 
                              groupings, 
                              summaries, 
                              filters,   
                              allHeaders,
                              true 
                          );

                          if (sectionTableData.processedData.length === 0) {
                              return (
                                  <Card key={sectionName}>
                                      <CardHeader className="flex flex-row items-center justify-between">
                                          <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                                           <Button 
                                            onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} 
                                            size="sm" 
                                            variant="outline"
                                            disabled={true}
                                          >
                                            <Download className="mr-2 h-4 w-4" /> PDF
                                          </Button>
                                      </CardHeader>
                                      <CardContent>
                                          <p className="text-muted-foreground">No data matches the current filters for this section.</p>
                                      </CardContent>
                                  </Card>
                              );
                          }
                          return (
                            <Card key={sectionName} className="overflow-hidden">
                              <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                                <Button 
                                  onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} 
                                  size="sm" 
                                  variant="outline"
                                  disabled={sectionTableData.processedData.length === 0}
                                >
                                  <Download className="mr-2 h-4 w-4" /> PDF
                                </Button>
                              </CardHeader>
                              <CardContent className="min-h-0 pt-0">
                                 <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}> 
                                  <DataTable
                                      data={sectionTableData.processedData}
                                      columns={sectionTableData.columns}
                                      grandTotalRow={sectionTableData.grandTotalRow}
                                  />
                                 </div>
                              </CardContent>
                            </Card>
                          );
                      })}
                      
                       {hasAppliedFilters && filteredData.length > 0 && ![...new Set(filteredData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER))].length && (
                         <Card>
                            <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                                <AlertCircle className="h-12 w-12 text-primary/50 mb-4" />
                                <p className="font-semibold">No Sections Found in Filtered Data</p>
                                <p>The current filter selection resulted in data, but no specific 'section_name' values were found to group by for export.</p>
                                <p>The full filtered table is displayed in the "View Data" tab.</p>
                            </CardContent>
                         </Card>
                       )}
                       
                       {hasAppliedFilters && filteredData.length === 0 && rawData.length > 0 && (
                         <Card>
                            <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                                <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
                                <p className="font-semibold">No Data Matches Filters</p>
                                <p>The current filter selection resulted in no data from the uploaded file.</p>
                            </CardContent>
                         </Card>
                       )}
                    </div>
                  </ScrollArea>
                )}
                {rawData.length === 0 && isFileUploaded && !isProcessingFile && (
                    <Card className="flex-1">
                        <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                             <p className="font-semibold">No Data in File</p>
                            <p>No data found in the uploaded file for export.</p>
                        </CardContent>
                    </Card>
                )}
              </div>
            )}
            {!isProcessingFile && !isFileUploaded && (
                 <Card><CardContent className="p-6 text-center text-muted-foreground"><p>Please upload an Excel file first.</p></CardContent></Card>
            )}
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
