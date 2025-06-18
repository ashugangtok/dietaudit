
"use client";

import type React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { Leaf } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor } from '@/hooks/useTableProcessor';
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


export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploadExcel");
  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);

  const [groupings, setGroupings] = useState<GroupingOption[]>([]);
  const [summaries, setSummaries] = useState<SummarizationOption[]>([]);
  const [filters, setFilters] = useState<FilterOption[]>([]);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow } = useTableProcessor({ rawData, groupings, summaries, filters, allHeaders });

  const sortedDataForExportTab = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return [];
    }
    // Sort by section_name if it exists in the processedData's columns
    // The actual 'section_name' might be one of the grouping columns or a separate data column
    // For this generic sort, we assume 'section_name' is a direct key if available.
    // If 'section_name' is not a primary column in processedData (e.g., it was grouped away and not a grouping key),
    // this sort might not have a visible effect on that specific field, but will ensure stability.
    const sectionNameKey = currentTableColumns.find(col => col.toLowerCase() === 'section_name');

    return [...processedData].sort((a, b) => {
      if (sectionNameKey) {
        const sectionA = String(a[sectionNameKey] || '').toLowerCase();
        const sectionB = String(b[sectionNameKey] || '').toLowerCase();
        if (sectionA < sectionB) return -1;
        if (sectionA > sectionB) return 1;
      }
      // Fallback sort or if section_name is not present / not the primary sort key here
      return 0;
    });
  }, [processedData, currentTableColumns]);

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[]) => {
    setRawData(data);
    setAllHeaders(headers);
    setIsProcessingFile(false);
    setIsFileUploaded(true);
    setActiveTab("extractedData");
    setFilters([]);

    // Check if columns for the new default image-based pivot exist
    const requiredDefaultPivotCols = [
        ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
        ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
    ];
    const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => headers.includes(col as string));

    if (canApplyDefaultImagePivot) {
        const defaultGroupings: GroupingOption[] = DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string }));
        setGroupings(defaultGroupings);
        setSummaries(DEFAULT_IMAGE_PIVOT_SUMMARIES);
        toast({
            title: "Default Pivot View Applied",
            description: "Table configured with default groupings and summaries. Customize further as needed.",
        });
    } else {
        // Fallback if default image pivot columns are not all present
        // Try the old UOM pivot if its columns are present
        const canApplySpecialUOMPivot =
            SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => headers.includes(col as string)) &&
            headers.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD) &&
            headers.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD);

        if (canApplySpecialUOMPivot) {
            const uomPivotGroupings: GroupingOption[] = SPECIAL_PIVOT_UOM_ROW_GROUPINGS.map(col => ({ column: col as string }));
            setGroupings(uomPivotGroupings);

            const uomPivotSummaries: SummarizationOption[] = [{ column: SPECIAL_PIVOT_UOM_VALUE_FIELD, type: 'sum' }];
            setSummaries(uomPivotSummaries);

            toast({
                title: "Diet Analysis by Unit of Measure View Applied",
                description: "Table configured to show ingredient quantities by unit of measure. Customize further as needed.",
            });
        } else {
            // Generic fallback if neither pivot can be applied
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
                    title: "Data Loaded",
                    description: "Default pivot configuration could not be fully applied due to missing columns. Basic view applied. Configure manually or use filters.",
                    variant: "default"
                });
            }
        }
    }
  }, [toast]);

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
                  <h1 className="text-4xl font-bold">Diet Insights</h1>
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
                <CardHeader>
                  <CardTitle>Processing File...</CardTitle>
                  <CardDescription>Extracting data, please wait.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-6 w-48" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-4 w-full mt-4" />
                    <Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            )}
            {!isProcessingFile && isFileUploaded && rawData.length > 0 && (
              <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                <InteractiveFilters
                    rawData={rawData}
                    allHeaders={allHeaders}
                    filters={filters}
                    setFilters={setFilters}
                />
                <div className="flex-1 min-h-0">
                  <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
                </div>
              </div>
            )}
            {!isProcessingFile && isFileUploaded && rawData.length === 0 && (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                        <p>No data found in the uploaded file, or filters resulted in no data.</p>
                        <p>Please try uploading a different file or adjusting your filters.</p>
                    </CardContent>
                </Card>
            )}
             {!isProcessingFile && !isFileUploaded && (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                        <p>Please upload an Excel file to view data.</p>
                    </CardContent>
                </Card>
            )}
          </TabsContent>

          <TabsContent value="exportSections" className="mt-2 flex flex-col flex-1 min-h-0">
             {isProcessingFile && (
              <Card>
                <CardHeader>
                  <CardTitle>Processing File...</CardTitle>
                  <CardDescription>Please wait until processing is complete to access export options.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-6 w-48" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            )}
            {!isProcessingFile && isFileUploaded && (
              <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <InteractiveFilters
                    rawData={rawData}
                    allHeaders={allHeaders}
                    filters={filters}
                    setFilters={setFilters}
                />
                {sortedDataForExportTab.length > 0 ? (
                  <div className="flex-1 min-h-0">
                    <Card>
                    <CardHeader>
                        <CardTitle>Data Sorted by Section Name</CardTitle>
                        <CardDescription>
                        This table shows the data from the 'Extracted Data' tab (filtered and potentially grouped/summarized), sorted by section name (if available in the current view).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable data={sortedDataForExportTab} columns={currentTableColumns} />
                    </CardContent>
                    </Card>
                  </div>
                ) : rawData.length > 0 ? (
                     <Card>
                        <CardContent className="p-6 text-center text-muted-foreground">
                            <p>No data matches the current filters for the Export Sections view, or the data from 'Extracted Data' is empty.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardContent className="p-6 text-center text-muted-foreground">
                            <p>No data found in the uploaded file.</p>
                            <p>Please try uploading a different file.</p>
                        </CardContent>
                    </Card>
                )}
              </div>
            )}
            {!isProcessingFile && !isFileUploaded && (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                        <p>Please upload an Excel file first to enable export options.</p>
                    </CardContent>
                </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-auto">
        <div className="container mx-auto">
          Diet Insights &copy; {year}
        </div>
      </footer>
    </main>
  );
}
