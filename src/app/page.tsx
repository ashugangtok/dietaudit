
"use client";

import type React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, ServerCrash } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor, calculateProcessedTableData, type ProcessedTableData } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES,
    SPECIAL_PIVOT_UOM_ROW_GROUPINGS,
    SPECIAL_PIVOT_UOM_COLUMN_FIELD,
    SPECIAL_PIVOT_UOM_VALUE_FIELD
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import InteractiveFilters from '@/components/InteractiveFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';


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
  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow, filteredData } = useTableProcessor({ rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters });

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[]) => {
    setRawData(data);
    setAllHeaders(headers);
    setIsProcessingFile(false);
    setIsFileUploaded(true);
    setActiveTab("extractedData");
    setFilters([]); 
    setHasAppliedFilters(false); 

    const requiredDefaultPivotCols = [
        ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
        ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
    ];
    const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => headers.includes(col as string));

    if (canApplyDefaultImagePivot) {
        const defaultGroupings: GroupingOption[] = DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string }));
        setGroupings(defaultGroupings);
        setSummaries(DEFAULT_IMAGE_PIVOT_SUMMARIES);
        if (data.length > 0) {
            toast({
                title: "Default Pivot View Prepared",
                description: "Table configured with default groupings and summaries. Apply filters to view.",
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
            const fallbackGroupingCandidates: (keyof DietDataRow)[] = ['group_name', 'common_name', 'ingredient_name'];
            const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => headers.includes(h as string));
            const fallbackGroupings: GroupingOption[] = availableFallbackGroupings.length > 0
                ? availableFallbackGroupings.slice(0,2).map(col => ({ column: col as string }))
                : headers.length > 0 ? [{ column: headers[0] }] : [];
            setGroupings(fallbackGroupings);
            const fallbackSummaries: SummarizationOption[] = (headers.includes('ingredient_qty'))
                ? [{ column: 'ingredient_qty', type: 'sum' }]
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
  }, [toast]);

  const handleApplyFiltersCallback = useCallback((newFilters: FilterOption[]) => {
    setFilters(newFilters);
    setHasAppliedFilters(true);
  }, []);

  const uniqueSectionNamesForExport = useMemo((): string[] => {
    if (!hasAppliedFilters || !filteredData || filteredData.length === 0) {
      return [];
    }
    const sectionNames = new Set<string>();
    for (const row of filteredData) { // Use filteredData to get sections present after user's initial filtering
      const sectionName = String(row.section_name || '').trim();
      if (sectionName) {
        sectionNames.add(sectionName);
      }
    }
    return Array.from(sectionNames).sort();
  }, [filteredData, hasAppliedFilters]);


  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="bg-muted p-1 rounded-md">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Upload Excel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileUploaded && !isProcessingFile} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Extracted Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileUploaded && !isProcessingFile} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Export Sections</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2">
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
                  <FileUpload onDataParsed={handleDataParsed} onProcessing={setIsProcessingFile} />
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
                {rawData.length === 0 && isFileUploaded && (
                     <Card className="flex-1">
                        <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="font-semibold">No Data in File</p>
                            <p>No data found in the uploaded file.</p>
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
                      {uniqueSectionNamesForExport.length === 0 && processedData.length > 0 && (
                          <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Full Data View (No Specific Sections Filtered or Found)</CardTitle>
                            </CardHeader>
                            <CardContent className="min-h-0">
                                <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
                            </CardContent>
                          </Card>
                      )}
                      {uniqueSectionNamesForExport.map((sectionName) => {
                        const dataForThisSection = rawData.filter(row => String(row.section_name || '').trim() === sectionName.trim());
                        const sectionTableData: ProcessedTableData = calculateProcessedTableData(
                            dataForThisSection,
                            groupings, // Use main groupings
                            summaries, // Use main summaries
                            filters,   // Use main user-applied filters (already applied to get dataForThisSection from rawData effectively)
                            allHeaders,
                            true // hasAppliedFilters is true here
                        );
                        if (sectionTableData.processedData.length === 0) {
                            return (
                                <Card key={sectionName}>
                                    <CardHeader>
                                        <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">No data matches the current filters for this section.</p>
                                    </CardContent>
                                </Card>
                            );
                        }
                        return (
                          <Card key={sectionName} className="overflow-hidden">
                            <CardHeader>
                              <CardTitle className="text-xl font-semibold">Section: {sectionName}</CardTitle>
                            </CardHeader>
                            <CardContent className="min-h-0 pt-0"> {/* Ensure CardContent allows DataTable to manage its own height */}
                               <div style={{ height: '500px' }}> {/* Temporary fixed height for DataTable container */}
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
                       {uniqueSectionNamesForExport.length > 0 && processedData.length === 0 && (
                         <Card>
                            <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                                <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
                                <p className="font-semibold">No Data Matches Filters</p>
                                <p>The current filter selection resulted in no data for any section.</p>
                            </CardContent>
                         </Card>
                       )}
                    </div>
                  </ScrollArea>
                )}
                {rawData.length === 0 && isFileUploaded && (
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

