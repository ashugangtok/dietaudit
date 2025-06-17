
"use client";

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Leaf, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import { EXPECTED_PIVOT_ROW_GROUPINGS, PIVOT_COLUMN_FIELD, PIVOT_VALUE_FIELD, PIVOT_DEFAULT_FILTERS } from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTableControls from '@/components/DataTableControls';
import DataTable from '@/components/DataTable';
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

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[]) => {
    setRawData(data);
    setAllHeaders(headers);
    setIsFileUploaded(true);
    setActiveTab("extractedData");

    const canApplySpecialPivot = 
        EXPECTED_PIVOT_ROW_GROUPINGS.every(col => headers.includes(col as string)) &&
        headers.includes(PIVOT_COLUMN_FIELD) &&
        headers.includes(PIVOT_VALUE_FIELD);

    if (canApplySpecialPivot) {
        const defaultPivotGroupings: GroupingOption[] = EXPECTED_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string }));
        setGroupings(defaultPivotGroupings);

        const defaultPivotSummaries: SummarizationOption[] = [{ column: PIVOT_VALUE_FIELD, type: 'sum' }];
        setSummaries(defaultPivotSummaries);
        
        const defaultFiltersToAdd: FilterOption[] = PIVOT_DEFAULT_FILTERS
            .filter(filterCol => headers.includes(filterCol as string))
            .map(filterCol => ({ column: filterCol as string, value: '', type: 'contains' }));
        setFilters(defaultFiltersToAdd);

        toast({
            title: "Diet Analysis by Unit of Measure View Applied",
            description: "Table configured to show ingredient quantities by unit of measure. Customize further as needed.",
        });
    } else {
        const fallbackGroupingCandidates: (keyof DietDataRow)[] = ['group_name', 'common_name', 'ingredient_name'];
        const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => headers.includes(h as string));
        
        const fallbackGroupings: GroupingOption[] = availableFallbackGroupings.length > 0 
            ? availableFallbackGroupings.slice(0,2).map(col => ({ column: col as string })) // Limit to 2 for fallback
            : headers.length > 0 ? [{ column: headers[0] }] : [];
        setGroupings(fallbackGroupings);

        const fallbackSummaries: SummarizationOption[] = (headers.includes('ingredient_qty'))
            ? [{ column: 'ingredient_qty', type: 'sum' }]
            : [];
        setSummaries(fallbackSummaries);
        setFilters([]);
        
        if (data.length > 0 && !canApplySpecialPivot) {
            toast({
                title: "Data Loaded",
                description: "Default view applied. Some columns for the 'Diet Analysis by Unit of Measure' view might be missing. Configure manually.",
                variant: "default"
            });
        }
    }
  }, [toast]);

  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="px-4 py-2 border-b">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted p-1 rounded-md">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Upload Excel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileUploaded} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Extracted Data</TabsTrigger>
            {/* Placeholder tabs from screenshot - not functional yet */}
            <TabsTrigger value="rawMaterials" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Raw Materials Required</TabsTrigger>
            <TabsTrigger value="ingredientTotals" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Ingredient Totals</TabsTrigger>
            <TabsTrigger value="recipes" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Recipes</TabsTrigger>
            <TabsTrigger value="comboIngredients" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Combo Ingredients</TabsTrigger>
            <TabsTrigger value="choiceIngredients" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Choice Ingredients</TabsTrigger>
            <TabsTrigger value="summary" disabled={true} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm">Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-6">
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
                </CardHeader>
                <CardContent>
                  <FileUpload onDataParsed={handleDataParsed} onProcessing={setIsProcessingFile} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="extractedData" className="mt-6">
            {isProcessingFile && (
              <Card>
                <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-6 w-48" />
                    </div>
                    <Skeleton className="h-4 w-full mt-4" />
                    <Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            )}
            {!isProcessingFile && isFileUploaded && rawData.length > 0 && (
              <div className="space-y-6">
                <DataTableControls
                  allHeaders={allHeaders}
                  groupings={groupings}
                  setGroupings={setGroupings}
                  summaries={summaries}
                  setSummaries={setSummaries}
                  filters={filters}
                  setFilters={setFilters}
                  processedData={processedData}
                  currentColumns={currentTableColumns}
                />
                <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
              </div>
            )}
            {!isProcessingFile && isFileUploaded && rawData.length === 0 && (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                        <p>No data found in the uploaded file, or filters resulted in no data.</p>
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
