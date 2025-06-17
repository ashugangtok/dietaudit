
"use client";

import { useState, useCallback } from 'react';
import type React from 'react';
import FileUpload from '@/components/FileUpload';
import DataTableControls from '@/components/DataTableControls';
import DataTable from '@/components/DataTable';
import { useTableProcessor } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption, AISuggestions } from '@/types';
// import { suggestTableConfiguration, type SuggestTableConfigurationInput } from '@/ai/flows/suggest-table-configuration'; // AI suggestions can be re-enabled later if needed
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const DataVisualizer: React.FC = () => {
  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);
  
  const [groupings, setGroupings] = useState<GroupingOption[]>([]);
  const [summaries, setSummaries] = useState<SummarizationOption[]>([]);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null); // Kept for future use, but not primary for initial view
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAISuggesting, setIsAISuggesting] = useState(false); // Kept for future use
  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow } = useTableProcessor({ rawData, groupings, summaries, filters });

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[]) => {
    setRawData(data);
    setAllHeaders(headers);
    setAiSuggestions(null); 

    // Default Pivot Table Configuration
    const defaultPivotGroupings: GroupingOption[] = [
      'group_name', 
      'common_name', 
      'meal_start_time', 
      'diet_name', 
      'type_name', 
      'ingredient_name',
      'base_uom_name' // Added as per pivot row definition
    ]
      .filter(h => headers.includes(h))
      .map(col => ({ column: col }));
    setGroupings(defaultPivotGroupings);

    const defaultPivotSummaries: SummarizationOption[] = (headers.includes('ingredient_qty'))
      ? [{ column: 'ingredient_qty', type: 'sum' }]
      : [];
    setSummaries(defaultPivotSummaries);

    const defaultPivotFilters: FilterOption[] = [];
    if (headers.includes('section_name')) {
      defaultPivotFilters.push({ column: 'section_name', value: '', type: 'contains' });
    }
    if (headers.includes('meal_time')) {
      defaultPivotFilters.push({ column: 'meal_time', value: '', type: 'contains' });
    }
    setFilters(defaultPivotFilters);
    
    if (defaultPivotGroupings.length > 0 || defaultPivotSummaries.length > 0) {
        toast({
            title: "Default Pivot View Applied",
            description: "Table configured with pivot groupings, summary, and filters. Customize further as needed.",
        });
    } else if (data.length > 0) {
        toast({
            title: "Data Loaded",
            description: "Could not apply full default pivot view. Some necessary columns might be missing. Configure manually.",
            variant: "default"
        });
    }
  }, [toast]);

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Upload Data</CardTitle>
          <CardDescription>Upload your Excel file to begin analysis.</CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload onDataParsed={handleDataParsed} onProcessing={setIsProcessingFile} />
        </CardContent>
      </Card>

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

      {!isProcessingFile && rawData.length > 0 && (
        <Tabs defaultValue="configure" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="configure">Configure View</TabsTrigger>
            <TabsTrigger value="data">Extracted Data</TabsTrigger>
          </TabsList>
          <TabsContent value="configure">
            <Card>
              <CardHeader>
                <CardTitle>Data Configuration</CardTitle>
                <CardDescription>Adjust groupings, summaries, and filters. Default pivot view applied based on common configurations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAISuggesting && ( 
                  <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle>AI at Work!</AlertTitle>
                    <AlertDescription>
                      Generating smart suggestions for your table configuration...
                      <Skeleton className="h-4 w-full mt-2" />
                    </AlertDescription>
                  </Alert>
                )}
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
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle>Processed Data Table</CardTitle>
                <CardDescription>View your analyzed dietary data.</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      
      {!isProcessingFile && rawData.length === 0 && (
        <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
                <p>Upload an Excel file to get started.</p>
            </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DataVisualizer;

