"use client";

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import FileUpload from '@/components/FileUpload';
import DataTableControls from '@/components/DataTableControls';
import DataTable from '@/components/DataTable';
import { useTableProcessor } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption, AISuggestions } from '@/types';
import { suggestTableConfiguration, type SuggestTableConfigurationInput } from '@/ai/flows/suggest-table-configuration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const DataVisualizer: React.FC = () => {
  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);
  
  const [groupings, setGroupings] = useState<GroupingOption[]>([]);
  const [summaries, setSummaries] = useState<SummarizationOption[]>([]);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow } = useTableProcessor({ rawData, groupings, summaries, filters });

  const handleDataParsed = useCallback(async (data: DietDataRow[], headers: string[]) => {
    setRawData(data);
    setAllHeaders(headers);
    // Reset configurations
    setGroupings([]);
    setSummaries([]);
    setFilters([]);
    setAiSuggestions(null);

    if (data.length > 0 && headers.length > 0) {
      setIsAISuggesting(true);
      try {
        // Prepare a sample of data for AI (e.g., first 10 rows)
        const dataSample = data.slice(0, 10).map(row => 
          headers.map(header => String(row[header] ?? '')).join(', ')
        ).join('\n');

        const input: SuggestTableConfigurationInput = {
          excelData: dataSample,
          columnHeaders: headers,
        };
        const suggestions = await suggestTableConfiguration(input);
        setAiSuggestions(suggestions);
        
        // Apply initial suggestions
        if (suggestions.groupingSuggestions?.length) {
          setGroupings(suggestions.groupingSuggestions.filter(sg => headers.includes(sg)).map(col => ({ column: col })));
        }
        if (suggestions.summarizationSuggestions?.length) {
           const numericHeaders = headers.filter(h => data.some(row => typeof row[h] === 'number'));
           setSummaries(
            suggestions.summarizationSuggestions
              .filter(ss => numericHeaders.includes(ss)) // Ensure suggested summary column exists and is numeric-like
              .map(col => ({ column: col, type: 'sum' })) // Default to sum
              .slice(0, 2) // Limit initial summaries
          );
        }
         toast({
          title: "AI Suggestions Applied",
          description: "Initial table configuration set by AI. You can customize it further.",
        });

      } catch (error) {
        console.error("Error getting AI suggestions:", error);
        toast({
          variant: "destructive",
          title: "AI Suggestion Error",
          description: "Could not get AI-powered suggestions for table configuration.",
        });
      } finally {
        setIsAISuggesting(false);
      }
    }
  }, [toast]);

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Upload and Configuration</CardTitle>
          <CardDescription>Upload your Excel file and configure the data table view.</CardDescription>
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
        <>
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
          {aiSuggestions && !isAISuggesting && (
            <Alert variant="default" className="bg-primary/10 border-primary/30">
              <Lightbulb className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">AI Suggestions</AlertTitle>
              <AlertDescription className="text-foreground/80">
                Initial configuration set by AI. Customize grouping, summaries, and filters below as needed.
                {aiSuggestions.groupingSuggestions?.length > 0 && <p className="mt-1 text-sm">Suggested grouping: {aiSuggestions.groupingSuggestions.join(', ')}</p>}
                {aiSuggestions.summarizationSuggestions?.length > 0 && <p className="text-sm">Suggested summaries for: {aiSuggestions.summarizationSuggestions.join(', ')}</p>}
              </AlertDescription>
            </Alert>
          )}
          <Card>
             <CardHeader>
                <CardTitle>Data Controls</CardTitle>
                <CardDescription>Adjust how your data is grouped, summarized, and filtered.</CardDescription>
            </CardHeader>
            <CardContent>
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
          
          <Card>
            <CardHeader>
                <CardTitle>Processed Data Table</CardTitle>
                <CardDescription>View your analyzed dietary data.</CardDescription>
            </CardHeader>
            <CardContent>
                <DataTable data={processedData} columns={currentTableColumns} grandTotalRow={grandTotalRow} />
            </CardContent>
          </Card>
        </>
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
