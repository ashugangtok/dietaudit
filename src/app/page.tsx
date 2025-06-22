
"use client";

import React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { FileSpreadsheet, FileSearch, TableIcon, Download, Loader2, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor, calculateProcessedTableData } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES,
    PIVOT_BLANK_MARKER,
    PIVOT_SUBTOTAL_MARKER,
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import SimpleFilterPanel from '@/components/SimpleFilterPanel';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';
import { parseExcelAction } from '@/lib/actions/parseExcelAction';

const getAbbreviatedUom = (uom: string): string => {
  if (!uom) return '';
  const lowerUom = uom.toLowerCase().trim();
  if (lowerUom === 'kilogram' || lowerUom === 'kilograms') return 'kg';
  if (lowerUom === 'piece' || lowerUom === 'pieces') return 'pcs';
  return uom.trim();
};

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

  // State for Audit Tab
  const [auditDisplayData, setAuditDisplayData] = useState<DietDataRow[]>([]);
  const [auditColumns, setAuditColumns] = useState<string[]>([]);
  const [auditGrandTotal, setAuditGrandTotal] = useState<DietDataRow | undefined>(undefined);


  const { toast } = useToast();

  // This is primarily for "View Data" tab
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
        setAuditDisplayData([]);
        setAuditColumns([]);
        setAuditGrandTotal(undefined);
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
    setAuditDisplayData([]);
    setAuditColumns([]);
    setAuditGrandTotal(undefined);
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
        const result = await parseExcelAction({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

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
            if (totalAnimalSummaryIndex !== -1 && result.headers.includes('animal_id')) { // Ensure animal_id is present for unique count
                 currentViewSummaries[totalAnimalSummaryIndex].type = 'first'; // type: 'first' implies unique count in processor
            } else if (result.headers.includes('total_animal') && result.headers.includes('animal_id')) {
                currentViewSummaries.push({ column: 'total_animal', type: 'first'});
            }
            setDefaultSummaries(currentViewSummaries);

        } else {
            const fallbackGroupingCandidates = ['group_name', 'common_name', 'diet_name', 'type', 'ingredient_name', 'meal_start_time', 'section_name', 'site_name'];
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

    // useEffect for processing Audit Tab data
    useEffect(() => {
        if (activeTab === 'audit' && hasAppliedFilters && rawData.length > 0) {
            setIsLoading(true);

            // Step 1: Filter raw data based on UI filters
            const { filteredData } = calculateProcessedTableData(
                rawData, [], [], filters, allHeaders, true
            );

            // Step 2: Get species breakdown and total animal count per diet group
            const dietToSpeciesBreakdown = new Map<string, string>();
            const dietGroupAnimalCounts = new Map<string, number>();

            if (allHeaders.includes('common_name') && allHeaders.includes('animal_id')) {
                const dietSpeciesAnimals = new Map<string, Map<string, Set<string>>>();
                
                filteredData.forEach(row => {
                    const dietKey = `${row.group_name || ''}|${row.meal_start_time || ''}|${row.diet_name || ''}`;
                    if (!dietSpeciesAnimals.has(dietKey)) {
                        dietSpeciesAnimals.set(dietKey, new Map());
                    }
                    const speciesMap = dietSpeciesAnimals.get(dietKey)!;
                    const speciesName = String(row.common_name || 'Unknown');
                    if (!speciesMap.has(speciesName)) {
                        speciesMap.set(speciesName, new Set());
                    }
                    if (row.animal_id) {
                        speciesMap.get(speciesName)!.add(String(row.animal_id));
                    }
                });

                dietSpeciesAnimals.forEach((speciesMap, dietKey) => {
                    const dietName = dietKey.split('|')[2] || 'Diet';
                    const totalSpeciesCount = speciesMap.size;
                    const breakdownLines = Array.from(speciesMap.entries())
                        .map(([species, animalSet]) => `${species} (${animalSet.size})`)
                        .sort();
                    const header = `${dietName} (${totalSpeciesCount})`;
                    const finalBreakdownString = [header, ...breakdownLines].join('\n');
                    dietToSpeciesBreakdown.set(dietKey, finalBreakdownString);
                    
                    let totalAnimalsInGroup = 0;
                    speciesMap.forEach(animalSet => totalAnimalsInGroup += animalSet.size);
                    dietGroupAnimalCounts.set(dietKey, totalAnimalsInGroup);
                });
            }

            // Step 3: Define groupings and SUM ingredient_qty
            const auditGroupings: GroupingOption[] = [
                { column: 'group_name' },
                { column: 'meal_start_time' },
                { column: 'diet_name' },
                { column: 'type_name' },
                { column: 'ingredient_name' },
            ];
            const auditSummaries: SummarizationOption[] = [
                { column: 'ingredient_qty', type: 'sum' },
                { column: 'base_uom_name', type: 'first' },
            ];

            // Step 4: Process data WITHOUT display blanking to keep context for calculations
            const { processedData: pivotedDataUnblanked, grandTotalRow: initialGrandTotal } = calculateProcessedTableData(
                filteredData,
                auditGroupings,
                auditSummaries,
                [], // Filters already applied
                allHeaders,
                true,
                true // IMPORTANT: Disable blanking for post-processing
            );

            // Step 5: Post-process to calculate final total and format diet name
            const dataWithFinalTotals = pivotedDataUnblanked.map(row => {
                const newRow = { ...row };
                const dietKey = `${row.group_name || ''}|${row.meal_start_time || ''}|${row.diet_name || ''}`;
                
                // The 'ingredient_qty_sum' from the processor is the correct total required quantity.
                // It correctly sums the per-animal quantity from the filtered raw data.
                newRow.total_qty_required_sum = parseFloat(String(row.ingredient_qty_sum)) || 0;

                // Format diet name with species breakdown
                const breakdownString = dietToSpeciesBreakdown.get(dietKey);
                if (breakdownString) {
                    newRow.diet_name = breakdownString;
                }
                
                // Cleanup
                if (newRow.type_name === '(blank)') {
                    newRow.type_name = '';
                }

                return newRow;
            });
            
            // Step 5.5: Insert subtotal rows for groups with a type_name
            const dataWithSubtotals: DietDataRow[] = [];
            let currentSpecialGroup: {
                key: string;
                name: string;
                total: number;
                uom: string;
                templateRow: DietDataRow;
            } | null = null;

            for (const row of dataWithFinalTotals) {
                const typeName = String(row.type_name || '').trim();
                const isSubtotalGroupItem = typeName !== '';
                const groupKey = `${row.group_name}|${row.meal_start_time}|${row.diet_name}|${row.type_name}`;

                // If we are leaving a special group, add its subtotal row before processing the current row
                if (currentSpecialGroup && currentSpecialGroup.key !== groupKey) {
                    const subtotalRow: DietDataRow = {
                        ...currentSpecialGroup.templateRow, // Get layout from last row
                        group_name: PIVOT_BLANK_MARKER,
                        meal_start_time: PIVOT_BLANK_MARKER,
                        diet_name: PIVOT_BLANK_MARKER,
                        type_name: PIVOT_BLANK_MARKER,
                        ingredient_name: `Subtotal for ${currentSpecialGroup.name}`,
                        total_qty_required_sum: parseFloat(currentSpecialGroup.total.toFixed(4)),
                        base_uom_name_first: currentSpecialGroup.uom,
                        'Received Qty': '',
                        'Difference': undefined,
                        note: PIVOT_SUBTOTAL_MARKER,
                    };
                    // Clear other summary fields for the subtotal row
                    Object.keys(subtotalRow).forEach(key => {
                        if (key.endsWith('_sum') || key.endsWith('_first') || key.endsWith('_count')) {
                            if (key !== 'total_qty_required_sum' && key !== 'base_uom_name_first') {
                                delete subtotalRow[key];
                            }
                        }
                    });

                    dataWithSubtotals.push(subtotalRow);
                    currentSpecialGroup = null;
                }

                dataWithSubtotals.push(row);

                if (isSubtotalGroupItem) {
                    if (!currentSpecialGroup) {
                        currentSpecialGroup = {
                            key: groupKey,
                            name: String(row.type_name),
                            total: 0,
                            uom: String(row.base_uom_name_first || ''),
                            templateRow: row
                        };
                    }
                    currentSpecialGroup.total += parseFloat(String(row.total_qty_required_sum)) || 0;
                    currentSpecialGroup.uom = String(row.base_uom_name_first || currentSpecialGroup.uom);
                    currentSpecialGroup.templateRow = row; // Always use the last row as the template for keys
                }
            }
            
            // After loop, check if the last item was in a special group
            if (currentSpecialGroup) {
                const subtotalRow: DietDataRow = {
                    ...currentSpecialGroup.templateRow,
                    group_name: PIVOT_BLANK_MARKER,
                    meal_start_time: PIVOT_BLANK_MARKER,
                    diet_name: PIVOT_BLANK_MARKER,
                    type_name: PIVOT_BLANK_MARKER,
                    ingredient_name: `Subtotal for ${currentSpecialGroup.name}`,
                    total_qty_required_sum: parseFloat(currentSpecialGroup.total.toFixed(4)),
                    base_uom_name_first: currentSpecialGroup.uom,
                    'Received Qty': '',
                    'Difference': undefined,
                    note: PIVOT_SUBTOTAL_MARKER,
                };
                Object.keys(subtotalRow).forEach(key => {
                    if (key.endsWith('_sum') || key.endsWith('_first') || key.endsWith('_count')) {
                        if (key !== 'total_qty_required_sum' && key !== 'base_uom_name_first') {
                            delete subtotalRow[key];
                        }
                    }
                });

                dataWithSubtotals.push(subtotalRow);
            }

            // Step 6: Manually apply display blanking for the pivot table effect
            let lastKeyValues: (string | number | undefined)[] = new Array(auditGroupings.length).fill(null);
            const finalPivotedData = dataWithSubtotals.map(row => {
                // Subtotal rows are pre-formatted and should not affect blanking of subsequent rows
                if (row.note === PIVOT_SUBTOTAL_MARKER) {
                    return row;
                }
                const newRowWithBlanks = { ...row };
                let isSameAsLast = true;
                for (let i = 0; i < auditGroupings.length; i++) {
                    const col = auditGroupings[i].column;
                    if (isSameAsLast && row[col] === lastKeyValues[i]) {
                        newRowWithBlanks[col] = PIVOT_BLANK_MARKER;
                    } else {
                        isSameAsLast = false;
                    }
                    lastKeyValues[i] = row[col];
                }
                return newRowWithBlanks;
            });

            // Step 7: Calculate final grand total
            const finalGrandTotal = initialGrandTotal ? { ...initialGrandTotal } : undefined;
            if (finalGrandTotal) {
                // The grand total from the processor is already correct. Just assign it to the display column.
                finalGrandTotal.total_qty_required_sum = finalGrandTotal.ingredient_qty_sum;
            }
            
            // Step 8: Final cleanup and state update
            const finalColumns = [
                ...auditGroupings.map(g => g.column), 
                'total_qty_required_sum',
                'Received Qty',
                'Difference',
                'base_uom_name_first'
            ];
            
            setAuditDisplayData(finalPivotedData);
            setAuditColumns(finalColumns);
            setAuditGrandTotal(finalGrandTotal);
            setIsLoading(false);

        } else if (activeTab === 'audit' && (!hasAppliedFilters || rawData.length === 0)) {
            setAuditDisplayData([]);
            setAuditColumns([]);
            setAuditGrandTotal(undefined);
        }
    }, [activeTab, rawData, allHeaders, filters, hasAppliedFilters]);

  const handleAuditRowChange = (rowIndex: number, column: string, value: string) => {
    setAuditDisplayData(prevData => {
      const newData = [...prevData];
      const rowToUpdate = { ...newData[rowIndex] };

      if (column === 'Received Qty') {
        rowToUpdate['Received Qty'] = value;

        const totalRequired = rowToUpdate['total_qty_required_sum'];
        if (typeof totalRequired === 'number' && value.trim() !== '') {
          const receivedQty = parseFloat(value);
          if (!isNaN(receivedQty)) {
            rowToUpdate['Difference'] = receivedQty - totalRequired;
          } else {
            rowToUpdate['Difference'] = undefined;
          }
        } else {
          rowToUpdate['Difference'] = undefined;
        }
      }
      
      newData[rowIndex] = rowToUpdate;
      return newData;
    });
  };

  const handleDownloadAllPdf = () => {
    let dataToExport: DietDataRow[] = [];
    let columnsToExport: string[] = [];
    let grandTotalToExport: DietDataRow | undefined = undefined;
    let reportTitleSuffix = "Report";

    if (activeTab === 'audit') {
      if (auditDisplayData.length === 0 || !hasAppliedFilters) {
        toast({ variant: "destructive", title: "No Data", description: "No data available to export for the audit view." });
        return;
      }
      dataToExport = auditDisplayData;
      columnsToExport = auditColumns;
      grandTotalToExport = auditGrandTotal;
      reportTitleSuffix = "Audit Report";
    } else if (activeTab === "extractedData") { 
        dataToExport = processedData.map(row => ({...row})); 
        columnsToExport = [...currentTableColumns];
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined; 
        reportTitleSuffix = "Full Diet Report";
    }
    
    const uomKey = columnsToExport.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));
    const ingredientQtyFirstKey = columnsToExport.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_first'));
    const totalQtyRequiredKey = 'total_qty_required_sum';

    dataToExport = dataToExport.map(row => {
        const newRow = {...row};
        
        // Format Total column
        if (uomKey && newRow[totalQtyRequiredKey] !== undefined) {
            const totalQty = newRow[totalQtyRequiredKey];
            const uom = row[uomKey] || (grandTotalToExport ? grandTotalToExport[uomKey] : undefined);
            if (typeof totalQty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[totalQtyRequiredKey] = `${totalQty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${getAbbreviatedUom(uom)}`;
            }
        }

        // Format Qty/Animal if it exists
        if (ingredientQtyFirstKey && uomKey && newRow[ingredientQtyFirstKey] !== undefined) {
            const qtyPerAnimal = newRow[ingredientQtyFirstKey];
            const uom = row[uomKey];
            if (typeof qtyPerAnimal === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[ingredientQtyFirstKey] = `${qtyPerAnimal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${getAbbreviatedUom(uom)}`;
            }
        }
        
        // Ensure Received Qty is a string for the PDF
        if (newRow['Received Qty'] !== undefined) {
            newRow['Received Qty'] = String(newRow['Received Qty']);
        }

        // Format Difference column
        if (row['Difference'] !== undefined && typeof row['Difference'] === 'number') {
            const diff = row['Difference'] as number;
            const uom = (uomKey && row[uomKey]) ? getAbbreviatedUom(String(row[uomKey])) : '';
             if (uom) {
                newRow['Difference'] = `${diff.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom}`;
            } else {
                newRow['Difference'] = diff.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
            }
        }

        return newRow;
    });

    if (grandTotalToExport && uomKey) {
        if (grandTotalToExport[totalQtyRequiredKey] !== undefined && typeof grandTotalToExport[totalQtyRequiredKey] === 'number') {
            const qty = grandTotalToExport[totalQtyRequiredKey] as number;
            const uom = grandTotalToExport[uomKey];
            if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                grandTotalToExport[totalQtyRequiredKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${getAbbreviatedUom(uom)}`;
            }
        }
    }
    
    if (dataToExport.length > 0 && columnsToExport.length > 0 && hasAppliedFilters) {
      let pdfColumns = [...columnsToExport];
      if (uomKey) {
          pdfColumns = pdfColumns.filter(c => c !== uomKey);
      }
      
      exportToPdf(dataToExport, pdfColumns, `${reportTitleSuffix} - ${rawFileName}`, `${rawFileName}_${activeTab}_report`, grandTotalToExport);
      toast({ title: "PDF Download Started", description: `Your ${reportTitleSuffix} PDF is being generated.` });
    } else if (hasAppliedFilters && dataToExport.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export for the current filters." });
    } else {
      toast({ variant: "destructive", title: "No Data", description: "Apply filters to process data before exporting." });
    }
  };

  const year = new Date().getFullYear();

  const renderAuditTable = () => {
    if (auditDisplayData.length === 0 && hasAppliedFilters && rawData.length > 0) {
       return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the Audit view.</CardContent></Card>;
    }
    if (auditDisplayData.length === 0) return null;

    return (
      <div className="flex-1 min-h-0">
        <div className="flex justify-end mb-2">
            <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || auditDisplayData.length === 0 || !hasAppliedFilters}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PDF
            </Button>
        </div>
        <DataTable
          data={auditDisplayData}
          columns={auditColumns}
          grandTotalRow={auditGrandTotal}
          allHeaders={allHeaders}
          isAuditTab={true}
          onAuditRowChange={handleAuditRowChange}
        />
      </div>
    );
  };


  const renderContentForDataTabs = (currentActiveTab: string) => {
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

    if (isFileSelected && !hasAppliedFilters && currentActiveTab !== "uploadExcel") {
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
    
    // Specific rendering for Audit tab
    if (currentActiveTab === 'audit') {
        return renderAuditTable();
    }

    // Default rendering for View Data tab (and previously other tabs)
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
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><UploadCloud className="h-4 w-4"/>Upload</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="audit" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><FileSearch className="h-4 w-4"/>Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto flex items-center justify-center">
             {renderContentForDataTabs("uploadExcel")}
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
                {renderContentForDataTabs("extractedData")}
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
                {renderContentForDataTabs("audit")}
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
    
    

    
