
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2, BarChartHorizontalBig, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor, calculateProcessedTableData, type ProcessedTableData } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES,
    PIVOT_BLANK_MARKER,
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import SimpleFilterPanel from '@/components/SimpleFilterPanel';
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
         // animal_id is crucial for correct animal counting.
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
                 // The 'first' type for 'total_animal' is now handled by useTableProcessor to count unique animal_ids
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
            if (result.headers.includes('ingredient_qty')) fallbackSummaries.push({ column: 'ingredient_qty', type: 'sum' });
            if (result.headers.includes('base_uom_name')) fallbackSummaries.push({ column: 'base_uom_name', type: 'first'});
            if (result.headers.includes('total_animal') && result.headers.includes('animal_id')) {
                fallbackSummaries.push({ column: 'total_animal', type: 'first'});
            } else if (result.headers.includes('total_animal')) {
                 fallbackSummaries.push({ column: 'total_animal', type: 'first'}); // Fallback if animal_id not present
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

    if (activeTab === "extractedData") {
        dataToExport = processedData.map(row => ({...row})); // Shallow copy
        columnsToExport = [...currentTableColumns];
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined; // Shallow copy
        reportTitleSuffix = "Full Diet Report";
        isViewDataForPdf = true; // Mark for special PDF handling if needed
    } else if (activeTab === "comparison") {
        const comparisonGroupings: GroupingOption[] = DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS
            .filter(g => g !== 'common_name') 
            .map(col => ({ column: col as string }));
        
        const comparisonTableData = calculateProcessedTableData(
            rawData,
            comparisonGroupings,
            defaultSummaries,
            filters,
            allHeaders,
            hasAppliedFilters,
            false
        );
        dataToExport = comparisonTableData.processedData.map(row => ({...row}));
        columnsToExport = [...comparisonTableData.columns];
        grandTotalToExport = comparisonTableData.grandTotalRow ? {...comparisonTableData.grandTotalRow} : undefined;
        reportTitleSuffix = "Comparison Report";

    } else if (activeTab === "exportSections") {
        dataToExport = processedData.map(row => ({...row}));
        columnsToExport = [...currentTableColumns];
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined;
        reportTitleSuffix = "Combined Section Report";
    }

    const uomKey = columnsToExport.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));
    const ingredientQtySumKey = columnsToExport.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));

    if (uomKey && ingredientQtySumKey && allHeaders.includes('base_uom_name')) {
        dataToExport = dataToExport.map(row => {
            const newRow = {...row};
            const qty = newRow[ingredientQtySumKey];
            const uom = row[uomKey];
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (grandTotalToExport && typeof grandTotalToExport[ingredientQtySumKey] === 'number') {
            const qty = grandTotalToExport[ingredientQtySumKey] as number;
            const uom = grandTotalToExport[uomKey];
            if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 grandTotalToExport[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
         if (uomKey !== ingredientQtySumKey) { // This condition might change if View Data PDF needs UoM
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


  const handleDownloadSectionPdf = (sectionName: string, sectionTableDataInput: ProcessedTableData) => {
     const sectionTableData = {
         processedData: sectionTableDataInput.processedData.map(row => ({...row})),
         columns: [...sectionTableDataInput.columns],
         grandTotalRow: sectionTableDataInput.grandTotalRow ? {...sectionTableDataInput.grandTotalRow} : undefined
     };

     const ingredientQtySumKey = sectionTableData.columns.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
     const uomKey = sectionTableData.columns.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));

     if (ingredientQtySumKey && uomKey && allHeaders.includes('base_uom_name')) {
        sectionTableData.processedData = sectionTableData.processedData.map(row => {
            const newRow = {...row};
            const qty = newRow[ingredientQtySumKey];
            const uom = newRow[uomKey];
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (sectionTableData.grandTotalRow && typeof sectionTableData.grandTotalRow[ingredientQtySumKey] === 'number') {
            const qty = sectionTableData.grandTotalRow[ingredientQtySumKey] as number;
            const uom = sectionTableData.grandTotalRow[uomKey];
             if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 sectionTableData.grandTotalRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
        if (uomKey !== ingredientQtySumKey) {
            sectionTableData.columns = sectionTableData.columns.filter(c => c !== uomKey);
        }
     }

     if (sectionTableData.processedData.length > 0 && sectionTableData.columns.length > 0 && hasAppliedFilters) {
      exportToPdf(sectionTableData.processedData, sectionTableData.columns, `Section Report: ${sectionName} - ${rawFileName}`, `${rawFileName}_section_${sectionName.replace(/\s+/g, '_')}`, sectionTableData.grandTotalRow, false, allHeaders);
      toast({ title: "PDF Download Started", description: `PDF for section ${sectionName} is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: `No data available to export for section ${sectionName}. Ensure filters are applied.` });
    }
  };


  const year = new Date().getFullYear();

  const renderContentForDataTabs = (isExportTab: boolean, isComparisonTab: boolean = false) => {
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
    
    // Check for "View Data" and "Comparison" tabs specifically for the "no data for current view" message
    if (!isExportTab && processedData.length === 0 && rawData.length > 0 && hasAppliedFilters) {
       return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the current view.</CardContent></Card>;
    }


    if (isExportTab) { 
      const getSectionData = (sectionNameValue: string) => {
          const rawDataForThisSection = rawData.filter(row => {
            const sectionMatch = String(row.section_name || '').trim() === sectionNameValue;
            if (!sectionMatch) return false;
             return filters.every(filter => {
                const tempProcessed = calculateProcessedTableData([row], [], [], [filter], allHeaders, true, true);
                const valueAfterProcessing = tempProcessed.filteredData[0]?.[filter.column];
                const filterValue = filter.value;
                const normalizedRowValue = String(valueAfterProcessing ?? '').toLowerCase();

                if (valueAfterProcessing === undefined || valueAfterProcessing === null || String(valueAfterProcessing).trim() === '') {
                     return filter.type === 'equals' && (filterValue === '' || filterValue === null);
                }
                switch (filter.type) {
                  case 'equals': return normalizedRowValue === String(filterValue).toLowerCase();
                  case 'contains': if (filterValue === '') return true; return normalizedRowValue.includes(String(filterValue).toLowerCase());
                  case 'in': return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(normalizedRowValue);
                  case 'range_number':
                    if (Array.isArray(filterValue) && filterValue.length === 2) {
                      const [min, max] = filterValue.map(v => parseFloat(String(v)));
                      const numericRowValue = parseFloat(String(valueAfterProcessing));
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
          return calculateProcessedTableData( rawDataForThisSection, defaultGroupings, defaultSummaries, [], allHeaders, true, false );
      };

      const uniqueSectionNames = [...new Set(processedData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER && name !== "Grand Total"))].sort();
       if (uniqueSectionNames.length === 0 && processedData.length === 0 && rawData.length > 0 && hasAppliedFilters) { // No sections, but also no processed data due to filters
           return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data, so no sections can be displayed.</CardContent></Card>;
       }


      return (
        <>
          <div className="flex justify-end mb-2">
            <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || processedData.length === 0 || !hasAppliedFilters}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
               Download All Sections as PDF
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-6">
              {uniqueSectionNames.length > 0 ?
                uniqueSectionNames.map((sectionName) => {
                  const sectionTableData = getSectionData(sectionName);
                  if (sectionTableData.processedData.length === 0) {
                      return (
                          <Card key={sectionName}>
                              <CardHeader className="flex flex-row items-center justify-between p-4">
                                  <CardTitle className="text-lg font-semibold">Section: {sectionName}</CardTitle>
                                   <Button onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} size="sm" variant="outline" disabled={true}>
                                    <Download className="mr-2 h-4 w-4" /> PDF
                                  </Button>
                              </CardHeader>
                              <CardContent className="p-4"><p className="text-muted-foreground">No data matches the current global filters for this section.</p></CardContent>
                          </Card>
                      );
                  }
                  return (
                    <Card key={sectionName} className="overflow-hidden">
                      <CardHeader className="flex flex-row items-center justify-between p-4">
                        <CardTitle className="text-lg font-semibold">Section: {sectionName}</CardTitle>
                        <Button onClick={() => handleDownloadSectionPdf(sectionName, sectionTableData)} size="sm" variant="outline" disabled={isLoading || sectionTableData.processedData.length === 0 || !hasAppliedFilters}>
                          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} PDF
                        </Button>
                      </CardHeader>
                      <CardContent className="min-h-0 pt-0 p-0">
                         <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                          <DataTable
                            data={sectionTableData.processedData}
                            columns={sectionTableData.columns}
                            grandTotalRow={sectionTableData.grandTotalRow}
                            allHeaders={allHeaders}
                            isViewDataTab={false} 
                          />
                         </div>
                      </CardContent>
                    </Card>
                  );
              }) : (
                 <Card>
                    <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                        <AlertCircle className="h-12 w-12 text-primary/50 mb-4" />
                        <p className="font-semibold">No Sections Found</p>
                        <p>The current filter selection for "<strong>{rawFileName}</strong>" did not yield any data with 'section_name' values, or no data matched filters.</p>
                    </CardContent>
                 </Card>
               )}
            </div>
          </ScrollArea>
        </>
      );
    } else if (isComparisonTab) { 
        const comparisonGroupings: GroupingOption[] = DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS
            .filter(g => g !== 'common_name') 
            .map(col => ({ column: col as string }));
        
        const comparisonTableData = calculateProcessedTableData(
            rawData,
            comparisonGroupings,
            defaultSummaries,
            filters,
            allHeaders,
            hasAppliedFilters,
            false 
        );
        
        if (comparisonTableData.processedData.length === 0 && rawData.length > 0 && hasAppliedFilters) {
            return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the comparison view.</CardContent></Card>;
        }

        return (
            <div className="flex-1 min-h-0">
                 <div className="flex justify-end mb-2">
                     <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || comparisonTableData.processedData.length === 0 || !hasAppliedFilters}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
              <DataTable
                data={comparisonTableData.processedData}
                columns={comparisonTableData.columns}
                grandTotalRow={comparisonTableData.grandTotalRow}
                allHeaders={allHeaders}
                isViewDataTab={false} 
              />
            </div>
          );
    } else {  // This block serves "View Data"
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
            isViewDataTab={true} // Enable two-row display for View Data
          />
        </div>
      );
    }
  };


  return (
    <main className="min-h-screen text-foreground flex flex-col bg-transparent">
      <header className="px-4 py-3 border-b flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <DietWiseLogo />
      </header>
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><UploadCloud className="h-4 w-4"/>Upcel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
            <TabsTrigger value="comparison" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><BarChartHorizontalBig className="h-4 w-4"/>Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto flex items-center justify-center">
             {renderContentForDataTabs(false, false)}
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
                {renderContentForDataTabs(false, false)}
            </div>
          </TabsContent>

          <TabsContent value="exportSections" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <SimpleFilterPanel
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected}
                />
                {renderContentForDataTabs(true, false)}
              </div>
          </TabsContent>

          <TabsContent value="comparison" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <SimpleFilterPanel
                    rawData={rawData}
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected}
                />
                {renderContentForDataTabs(false, true)}
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
    

    

