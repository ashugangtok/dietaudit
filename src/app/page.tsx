
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2, BarChartHorizontalBig, Columns, Users } from 'lucide-react';
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
    PIVOT_BLANK_MARKER,
    NUMERIC_COLUMNS,
    PIVOT_SUBTOTAL_MARKER
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import InteractiveFilters from '@/components/InteractiveFilters';
import { ScrollArea } from '@/components/ui/scroll-area';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';


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
  const [isFileSelected, setIsFileSelected] = useState(false); 

  // For Comparison Tab - Ingredient Quantity Comparison
  const [actualComparisonQuantities, setActualComparisonQuantities] = useState<Record<string, string>>({});
  const [selectedComparisonColumn, setSelectedComparisonColumn] = useState<string | null>(null);
  const [actualGroupReceivedQuantities, setActualGroupReceivedQuantities] = useState<Record<string, string>>({});

  // For Comparison Tab - Actual Species Count File
  const [parsedActualSpeciesData, setParsedActualSpeciesData] = useState<DietDataRow[]>([]);
  const [isLoadingActualSpeciesFile, setIsLoadingActualSpeciesFile] = useState<boolean>(false);
  const [actualSpeciesFileName, setActualSpeciesFileName] = useState<string>("species_counts");


  // Data and columns for the comparison table, potentially merged with actual species counts
  const [dataForComparisonTable, setDataForComparisonTable] = useState<DietDataRow[]>([]);
  const [grandTotalForComparisonTable, setGrandTotalForComparisonTable] = useState<DietDataRow | undefined>();
  const [comparisonTableColumns, setComparisonTableColumns] = useState<string[]>([]);


  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow, filteredData } = useTableProcessor({ rawData, groupings, summaries, filters, allHeaders, hasAppliedFilters });

  useEffect(() => {
    if (!isFileSelected || rawData.length === 0) {
        setHasAppliedFilters(false);
        setFilters([]); 
        setActualComparisonQuantities({});
        setActualGroupReceivedQuantities({});
        setSelectedComparisonColumn(null);
        setParsedActualSpeciesData([]);
    }
  }, [isFileSelected, rawData]);

  useEffect(() => {
    if (currentTableColumns.length > 0 && activeTab === "comparison") {
      const firstNumericSummaryCol = currentTableColumns.find(col => 
        (typeof processedData[0]?.[col] === 'number' && col.startsWith('ingredient_qty_') && col.endsWith('_sum')) || 
        (NUMERIC_COLUMNS.includes(col as keyof DietDataRow) && col === 'ingredient_qty' && !col.startsWith('total_animal'))
      );
      if (firstNumericSummaryCol && !selectedComparisonColumn) {
        setSelectedComparisonColumn(firstNumericSummaryCol);
      } else if (!firstNumericSummaryCol && selectedComparisonColumn) {
        setSelectedComparisonColumn(null); 
      }
    }
  }, [currentTableColumns, activeTab, processedData, selectedComparisonColumn]);

  useEffect(() => {
    if (activeTab !== "comparison") {
        setDataForComparisonTable((processedData || []).map(row => ({ ...row })));
        setGrandTotalForComparisonTable(grandTotalRow ? { ...grandTotalRow } : undefined);
        setComparisonTableColumns(currentTableColumns ? [...currentTableColumns] : []);
        return;
    }
    
    // Logic specific to preparing data for the Comparison Tab
    let baseDataForComparison = (processedData || []).map(row => ({ ...row })); // Ensure a deep copy for modification
    let tempComparisonTableCols = currentTableColumns ? [...currentTableColumns] : []; // Start with a copy

    if (parsedActualSpeciesData && parsedActualSpeciesData.length > 0) {
      const speciesLookupKeys = ['site_name', 'section_name', 'user_enclosure_name', 'common_name'];
      const EMPTY_KEY_PART = '__EMPTY_CONTEXT_PART__';
      const actualSpeciesMap = new Map<string, number>();

      parsedActualSpeciesData.forEach(sRow => {
        const keyParts = speciesLookupKeys.map(k => {
          const val = sRow[k];
          return (val === undefined || val === null || String(val).trim() === '') ? EMPTY_KEY_PART : String(val).trim().toLowerCase();
        });
        if (keyParts.every(part => part !== EMPTY_KEY_PART)) { 
            const key = keyParts.join('||');
            const count = parseFloat(String(sRow['actual_animal_count'] ?? '0'));
            if (!isNaN(count)) {
                actualSpeciesMap.set(key, (actualSpeciesMap.get(key) || 0) + count);
            }
        }
      });
      
      let currentContext: Record<string, any> = {};
      baseDataForComparison = baseDataForComparison.map(pRow => {
        const newRow = { ...pRow }; 
        groupings.forEach(g => {
          const groupCol = g.column;
          if (pRow[groupCol] !== PIVOT_BLANK_MARKER && pRow[groupCol] !== undefined) {
            currentContext[groupCol] = pRow[groupCol];
          }
        });
        
        const lookupKeyParts = speciesLookupKeys.map(k => {
          const val = currentContext[k]; 
          return (val === undefined || val === null || String(val).trim() === '') ? EMPTY_KEY_PART : String(val).trim().toLowerCase();
        });
        
        if (lookupKeyParts.every(part => part !== EMPTY_KEY_PART)) {
           const lookupKey = lookupKeyParts.join('||');
           newRow.actual_animal_count = actualSpeciesMap.get(lookupKey); 
        }
        return newRow;
      });
    }

    const dataWithUOMAppended = baseDataForComparison.map(row => {
        const newRow = { ...row }; 
        const uomColKey = 'base_uom_name_first'; 
        const ingredientQtySumColKey = tempComparisonTableCols.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum'));
        
        if (ingredientQtySumColKey && typeof newRow[ingredientQtySumColKey] === 'number' && 
            newRow[uomColKey] && typeof newRow[uomColKey] === 'string' && String(newRow[uomColKey]).trim() !== '') {
            const qty = newRow[ingredientQtySumColKey] as number;
            const uom = String(newRow[uomColKey]).trim();
            newRow[ingredientQtySumColKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom}`;
        }
        return newRow;
    });
    
    setDataForComparisonTable(dataWithUOMAppended);
    
    // Filter out columns not desired for the comparison tab's primary display
    let finalComparisonCols = tempComparisonTableCols.filter(col => 
        !['actual_animal_count', 'base_uom_name_first'].includes(col) && !col.startsWith('total_animal_')
    );

    if (selectedComparisonColumn) {
        // These are just string names for the columns to be added.
        // The DataTable component will handle rendering based on these names.
        const actualReceivedCol = `Actual Received for Group (${selectedComparisonColumn.replace(/_/g, ' ')})`;
        const groupDifferenceCol = `Group Difference (${selectedComparisonColumn.replace(/_/g, ' ')})`;
        
        const groupColumnsToAdd = [actualReceivedCol, groupDifferenceCol];
        
        if (!finalComparisonCols.includes(selectedComparisonColumn)) {
            finalComparisonCols.push(selectedComparisonColumn);
        }

        const insertAtIndex = finalComparisonCols.indexOf(selectedComparisonColumn);
        if (insertAtIndex !== -1) {
            finalComparisonCols.splice(insertAtIndex + 1, 0, ...groupColumnsToAdd);
        } else {
            finalComparisonCols.push(...groupColumnsToAdd);
        }
    }
    
    setComparisonTableColumns([...new Set(finalComparisonCols)]); 

    if (grandTotalRow) {
      const newGrandTotal = { ...grandTotalRow }; 
      ['actual_animal_count', 'base_uom_name_first'].forEach(colToExclude => delete newGrandTotal[colToExclude]);
      Object.keys(newGrandTotal).forEach(key => {
        if (key.startsWith('total_animal_')) {
            delete newGrandTotal[key];
        }
      });
      
      const ingredientSumKeyGT = tempComparisonTableCols.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum'));
      if (ingredientSumKeyGT && grandTotalRow[ingredientSumKeyGT] !== undefined && typeof grandTotalRow[ingredientSumKeyGT] === 'number') {
        newGrandTotal[ingredientSumKeyGT] = grandTotalRow[ingredientSumKeyGT]; 
      }
      
      setGrandTotalForComparisonTable(newGrandTotal);
    } else {
      setGrandTotalForComparisonTable(undefined);
    }

  }, [processedData, grandTotalRow, parsedActualSpeciesData, activeTab, hasAppliedFilters, groupings, currentTableColumns, allHeaders, summaries, selectedComparisonColumn]);


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
    setActiveTab("extractedData"); 
    setActualComparisonQuantities({});
    setActualGroupReceivedQuantities({});
    setSelectedComparisonColumn(null);
    setParsedActualSpeciesData([]); 

    toast({
        title: "File Selected",
        description: `"${cleanFileName}" is ready. Configure and apply filters to process and view data.`,
    });
    setIsLoading(false); 
  }, [toast]);

  const handleActualSpeciesFileSelectedCallback = useCallback(async (base64Content: string, fileName: string) => {
    setIsLoadingActualSpeciesFile(true);
    setActualSpeciesFileName(fileName.replace(/\.(xlsx|xls)$/i, ''));
    try {
        const result = await parseExcelFlow({ excelFileBase64: base64Content, originalFileName: fileName });
        if (result.error) {
            toast({ variant: "destructive", title: "Species File Parsing Error", description: result.error });
            setParsedActualSpeciesData([]);
        } else {
            setParsedActualSpeciesData(result.parsedData);
            toast({
                title: "Actual Species File Processed",
                description: `"${fileName}" processed with ${result.parsedData.length} rows. Its data will be used in the Comparison tab.`,
            });
        }
    } catch (error) {
        console.error("Error parsing actual species file:", error);
        toast({ variant: "destructive", title: "Species File Processing Error", description: "An unexpected error occurred." });
        setParsedActualSpeciesData([]);
    } finally {
        setIsLoadingActualSpeciesFile(false);
    }
  }, [toast]);


  const handleApplyFiltersCallback = useCallback(async (newFilters: FilterOption[]) => {
    if (!isFileSelected || !rawFileBase64) { 
        toast({ variant: "destructive", title: "No File Selected", description: "Please select an Excel file first." });
        return;
    }
    
    setIsLoading(true); 
    setActualComparisonQuantities({}); 
    setActualGroupReceivedQuantities({});
    
    try {
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            setSelectedComparisonColumn(null);
            setIsLoading(false);
            return;
        }

        setRawData(result.parsedData);
        setAllHeaders(result.headers);

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
                
                const fallbackSummaries: SummarizationOption[] = [];
                if (result.headers.includes('ingredient_qty')) {
                    fallbackSummaries.push({ column: 'ingredient_qty', type: 'sum' });
                }
                if (result.headers.includes('base_uom_name')) { 
                    fallbackSummaries.push({ column: 'base_uom_name', type: 'first' });
                }
                setSummaries(fallbackSummaries);
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
        setSelectedComparisonColumn(null);
    } finally {
        setIsLoading(false);
    }
  }, [isFileSelected, rawFileBase64, rawFileName, toast]);

  const generateRowKeyForPdf = (row: DietDataRow, relevantColumns: string[]): string => {
    const keyValues: string[] = [];
    for (const col of relevantColumns) {
      if (col.startsWith("Actual ") || col.startsWith("Difference ") || col.startsWith("Planned Total for Group") || col.startsWith("Actual Received for Group") || col.startsWith("Group Difference") || col === 'note') {
        continue;
      }
      const val = row[col];
      if (val === PIVOT_BLANK_MARKER) {
        keyValues.push(PIVOT_BLANK_MARKER);
      } else if (val === undefined || val === null) {
        keyValues.push("___NULL_OR_UNDEFINED___");
      } else {
        if (activeTab === "comparison" && typeof val === 'string' && relevantColumns.includes(selectedComparisonColumn || '')) {
            const numericPart = parseFloat(val);
            keyValues.push(isNaN(numericPart) ? String(val) : String(numericPart));
        } else {
            keyValues.push(String(val));
        }
      }
    }
    return keyValues.join('||');
  };
  
  const generateGroupRowKeyForPdf = (row: DietDataRow, groupContextColumns: string[], comparisonCol: string): string => {
    const keyParts: string[] = [];
    groupContextColumns.forEach(gCol => {
        if(groupings.map(g => g.column).includes(gCol) && row[gCol] !== PIVOT_BLANK_MARKER && row[gCol] !== undefined) {
             keyParts.push(String(row[gCol]));
        } else {
             keyParts.push(''); 
        }
    });
    keyParts.push(comparisonCol); 
    return keyParts.filter(p => p !== '').join('||');
};


  const handleDownloadAllPdf = () => {
    if (activeTab === "comparison") {
        if (!selectedComparisonColumn) {
            toast({ variant: "destructive", title: "Cannot Export", description: "Please select an ingredient quantity column for comparison before exporting." });
            return;
        }
        if (!hasAppliedFilters || dataForComparisonTable.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "No data available to export for comparison. Apply filters and select a comparison column first." });
            return;
        }

        const titleSuffix = "Comparison Report";
        const fileNameSuffix = "comparison_report";
        
        const baseColumnsForKeyGen = comparisonTableColumns.filter(c => !c.startsWith("Actual ") && !c.startsWith("Difference ") && !c.startsWith("Planned Total for Group") && !c.startsWith("Actual Received for Group") && !c.startsWith("Group Difference"));

        const dataForPdf = dataForComparisonTable.map(row => {
            const pdfRow = { ...row };
            const individualRowKey = generateRowKeyForPdf(row, comparisonTableColumns); 

            let plannedValueNum: number | undefined;
            const plannedValueFromTable = row[selectedComparisonColumn!]; 
            if (typeof plannedValueFromTable === 'string') {
                plannedValueNum = parseFloat(plannedValueFromTable); 
            } else if (typeof plannedValueFromTable === 'number') { 
                plannedValueNum = plannedValueFromTable;
            }
            plannedValueNum = isNaN(plannedValueNum!) ? 0 : plannedValueNum;

            const actualValueStr = actualComparisonQuantities[`${individualRowKey}_${selectedComparisonColumn!}`] || '';
            const actualValueNum = parseFloat(actualValueStr);
            
            pdfRow[`Actual ${selectedComparisonColumn!}`] = actualValueStr !== '' && !isNaN(actualValueNum) ? actualValueNum.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : '';
            
            if (actualValueStr !== '' && !isNaN(actualValueNum) && plannedValueNum !== undefined && !isNaN(plannedValueNum)) {
                const diffNum = actualValueNum - plannedValueNum;
                pdfRow[`Difference ${selectedComparisonColumn!}`] = parseFloat(diffNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
            } else {
                pdfRow[`Difference ${selectedComparisonColumn!}`] = '';
            }

            const groupNameCol = groupings.find(g => g.column === 'group_name')?.column;
            const commonNameCol = groupings.find(g => g.column === 'common_name')?.column;
            const isGroupSubtotalRow = groupNameCol && row[groupNameCol] && row[groupNameCol] !== PIVOT_BLANK_MARKER &&
                                    (!commonNameCol || row[commonNameCol] === PIVOT_BLANK_MARKER) &&
                                    row.note === PIVOT_SUBTOTAL_MARKER;

            if (isGroupSubtotalRow) {
                const groupKey = generateGroupRowKeyForPdf(row, groupings.map(g=>g.column), selectedComparisonColumn!);
                const actualGroupStr = actualGroupReceivedQuantities[`${groupKey}_${selectedComparisonColumn!}`] || ''; // Corrected key lookup
                const actualGroupNum = parseFloat(actualGroupStr);

                pdfRow[`Actual Received for Group (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = actualGroupStr !== '' && !isNaN(actualGroupNum) ? actualGroupNum.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : '';

                const plannedGroupNum = plannedValueNum; 
                if (actualGroupStr !== '' && !isNaN(actualGroupNum) && plannedGroupNum !== undefined && !isNaN(plannedGroupNum)) {
                    const groupDiffNum = actualGroupNum - plannedGroupNum;
                    pdfRow[`Group Difference (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = parseFloat(groupDiffNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                } else {
                     pdfRow[`Group Difference (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = '';
                }
            }
            return pdfRow;
        });

        const columnsForPdf = [...comparisonTableColumns]; 
        
        let grandTotalForPdf: DietDataRow | undefined = undefined;
        if (grandTotalForComparisonTable) {
            grandTotalForPdf = { ...grandTotalForComparisonTable };
            
            let plannedTotalNum: number | undefined;
            const plannedTotalFromGt = grandTotalForComparisonTable[selectedComparisonColumn!]; 
             if (typeof plannedTotalFromGt === 'number') {
                plannedTotalNum = plannedTotalFromGt;
                const uomForGrandTotal = String(grandTotalForComparisonTable['base_uom_name_first'] || '').trim();
                if (uomForGrandTotal) { 
                    grandTotalForPdf[selectedComparisonColumn!] = `${plannedTotalNum.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4})} ${uOMforGrandTotalPDF(dataForComparisonTable, selectedComparisonColumn!)}`;
                } else {
                    grandTotalForPdf[selectedComparisonColumn!] = plannedTotalNum.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
                }
            } else { 
                plannedTotalNum = parseFloat(String(plannedTotalFromGt).split(' ')[0]); 
                grandTotalForPdf[selectedComparisonColumn!] = String(plannedTotalFromGt ?? ''); 
            }
            plannedTotalNum = isNaN(plannedTotalNum!) ? 0 : plannedTotalNum;


            let totalActualIndividualNum = 0;
            let hasActualsIndividualForGt = false;
            dataForComparisonTable.forEach(dRow => {
                if (dRow.note !== PIVOT_SUBTOTAL_MARKER) { 
                    const individualRowKeyGt = generateRowKeyForPdf(dRow, comparisonTableColumns);
                    const actualValStrGt = actualComparisonQuantities[`${individualRowKeyGt}_${selectedComparisonColumn!}`];
                    if (actualValStrGt !== undefined && actualValStrGt !== '') {
                        const actualValNumGt = parseFloat(actualValStrGt);
                        if (!isNaN(actualValNumGt)) {
                            totalActualIndividualNum += actualValNumGt;
                            hasActualsIndividualForGt = true;
                        }
                    }
                }
            });
            grandTotalForPdf[`Actual ${selectedComparisonColumn!}`] = hasActualsIndividualForGt ? parseFloat(totalActualIndividualNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : "";
            if (hasActualsIndividualForGt && plannedTotalNum !== undefined && !isNaN(plannedTotalNum)) {
                const diffGt = totalActualIndividualNum - plannedTotalNum; 
                grandTotalForPdf[`Difference ${selectedComparisonColumn!}`] = parseFloat(diffGt.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
            } else {
                grandTotalForPdf[`Difference ${selectedComparisonColumn!}`] = "";
            }

            let totalActualGroupNum = 0;
            let hasActualsGroupForGt = false;
            Object.entries(actualGroupReceivedQuantities).forEach(([key, valStr]) => {
                 if (key.endsWith(`_${selectedComparisonColumn!}`)) { 
                    const actualValNum = parseFloat(valStr); 
                    if(!isNaN(actualValNum)) {
                         totalActualGroupNum += actualValNum;
                         hasActualsGroupForGt = true;
                    }
                 }
            });
             grandTotalForPdf[`Actual Received for Group (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = hasActualsGroupForGt ? parseFloat(totalActualGroupNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4}) : "";

            if(hasActualsGroupForGt && plannedTotalNum !== undefined && !isNaN(plannedTotalNum)) {
                const groupDiffGt = totalActualGroupNum - plannedTotalNum; 
                grandTotalForPdf[`Group Difference (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = parseFloat(groupDiffGt.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:4});
            } else {
                grandTotalForPdf[`Group Difference (${selectedComparisonColumn!.replace(/_/g, ' ')})`] = "";
            }
        }

        exportToPdf(dataForPdf, columnsForPdf, `${titleSuffix} - ${rawFileName}`, `${rawFileName}_${fileNameSuffix}`, grandTotalForPdf);
        toast({ title: "PDF Download Started", description: `Your Comparison report PDF is being generated.` });
        return;
    }

    // Existing PDF logic for other tabs
    let dataToExport = processedData.map(row => ({...row})); 
    let columnsToExport = [...currentTableColumns];
    let grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined;
    const currentTabTitleSuffix = activeTab === "exportSections" ? "Section Report" : "Full Diet Report";

    const ingredientQtySumKey = currentTableColumns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum'));
    if (ingredientQtySumKey && !isComparisonMode) { // Apply UoM for View Data / Export Section PDF
        dataToExport = dataToExport.map(row => {
            const newRow = {...row};
            const qty = newRow[ingredientQtySumKey];
            const uom = newRow['base_uom_name_first'];
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '') {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (grandTotalToExport && grandTotalToExport[ingredientQtySumKey] && typeof grandTotalToExport[ingredientQtySumKey] === 'number') {
            const qty = grandTotalToExport[ingredientQtySumKey] as number;
            const uom = grandTotalToExport['base_uom_name_first'];
            if (typeof uom === 'string' && uom.trim() !== '') {
                 grandTotalToExport[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
    }


    if (dataToExport.length > 0 && columnsToExport.length > 0 && hasAppliedFilters) {
      exportToPdf(dataToExport, columnsToExport, `${currentTabTitleSuffix} - ${rawFileName}`, `${rawFileName}_${activeTab === "exportSections" ? "section" : "full"}_report`, grandTotalToExport);
      toast({ title: "PDF Download Started", description: `Your ${currentTabTitleSuffix} PDF is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export. Apply filters to view data first." });
    }
  };
  
  const uOMforGrandTotalPDF = (data: DietDataRow[], qtyColumn: string): string => {
      if (!data || data.length === 0 || !qtyColumn) return '';
      const uomCounts: Record<string, number> = {};
      let mostCommonUom = '';
      let maxCount = 0;

      data.forEach(row => {
          const cellValue = row[qtyColumn];
          if (typeof cellValue === 'string') {
              const parts = cellValue.split(' ');
              if (parts.length > 1) {
                  const uom = parts.slice(1).join(' '); 
                  if (uom) {
                      uomCounts[uom] = (uomCounts[uom] || 0) + 1;
                      if (uomCounts[uom] > maxCount) {
                          maxCount = uomCounts[uom];
                          mostCommonUom = uom;
                      }
                  }
              }
          }
      });
      return mostCommonUom;
  };


  const handleDownloadSectionPdf = (sectionName: string, sectionTableDataInput: ProcessedTableData) => {
     const sectionTableData = {
         processedData: sectionTableDataInput.processedData.map(row => ({...row})),
         columns: [...sectionTableDataInput.columns],
         grandTotalRow: sectionTableDataInput.grandTotalRow ? {...sectionTableDataInput.grandTotalRow} : undefined
     };
    
     const ingredientQtySumKey = sectionTableData.columns.find(col => col.startsWith('ingredient_qty_') && col.endsWith('_sum'));
     if (ingredientQtySumKey) {
        sectionTableData.processedData = sectionTableData.processedData.map(row => {
            const newRow = {...row};
            const qty = newRow[ingredientQtySumKey];
            const uom = newRow['base_uom_name_first'];
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '') {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (sectionTableData.grandTotalRow && sectionTableData.grandTotalRow[ingredientQtySumKey] && typeof sectionTableData.grandTotalRow[ingredientQtySumKey] === 'number') {
            const qty = sectionTableData.grandTotalRow[ingredientQtySumKey] as number;
            const uom = sectionTableData.grandTotalRow['base_uom_name_first'];
             if (typeof uom === 'string' && uom.trim() !== '') {
                 sectionTableData.grandTotalRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
     }


     if (sectionTableData.processedData.length > 0 && sectionTableData.columns.length > 0 && hasAppliedFilters) {
      exportToPdf(sectionTableData.processedData, sectionTableData.columns, `Section Report: ${sectionName} - ${rawFileName}`, `${rawFileName}_section_${sectionName.replace(/\s+/g, '_')}`, sectionTableData.grandTotalRow);
      toast({ title: "PDF Download Started", description: `PDF for section ${sectionName} is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: `No data available to export for section ${sectionName}. Ensure filters are applied.` });
    }
  };

  const handleActualQuantityChange = useCallback((rowKey: string, columnKey: string, value: string) => {
    setActualComparisonQuantities(prev => ({
      ...prev,
      [`${rowKey}_${columnKey}`]: value,
    }));
  }, []);
  
  const handleActualGroupReceivedChange = useCallback((groupKey: string, columnKey: string, value: string) => {
    setActualGroupReceivedQuantities(prev => ({
      ...prev,
      [`${groupKey}_${columnKey}`]: value, // Key for group actuals, e.g., "SiteA||SectionB||Capuchins_ingredient_qty_sum"
    }));
  }, []);

  const year = new Date().getFullYear();

  const numericColumnsForComparison = useMemo(() => {
    if (!processedData.length || !currentTableColumns.length) return []; 
    
    return currentTableColumns.filter(col => {
        if (['actual_animal_count'].includes(col) || col.startsWith('total_animal') || col.startsWith('base_uom_name')) { 
            return false; 
        }
        const firstRowValue = processedData[0]?.[col]; 
        if (typeof firstRowValue === 'number') return true;
        if (processedData.length === 0 && grandTotalRow && typeof grandTotalRow[col] === 'number') return true; 
        if (col.includes('_sum') || col.includes('_average') || col.includes('_count')) return true; 
        if (NUMERIC_COLUMNS.includes(col as keyof DietDataRow) && col !== 'actual_animal_count' && !col.startsWith('total_animal')) return true; 
        return false;
    });
  }, [processedData, currentTableColumns, grandTotalRow]);


  const renderContentForDataTabs = (isExportTab: boolean, isComparisonTab: boolean = false) => {
    if (isLoading || (isComparisonTab && isLoadingActualSpeciesFile)) {
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

    if (isFileSelected && !hasAppliedFilters) {
      return (
        <Card className="flex-1">
          <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
            <FileSpreadsheet className="h-12 w-12 text-primary/50 mb-4" />
            <p>File "<strong>{rawFileName || 'selected file'}</strong>" is selected.</p>
            <p>Please configure and click "Apply Filters" to process and view the data.</p>
             {isComparisonTab && <p className="text-xs mt-2">(Comparison tools will be available after processing.)</p>}
            {!isComparisonTab && <p className="text-xs mt-2">(Filter options will populate after initial processing via 'Apply Filters'.)</p>}
          </CardContent>
        </Card>
      );
    }
    
    if (rawData.length === 0 && allHeaders.length > 0 && hasAppliedFilters) { 
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
    
    if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) { 
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
    
    const currentDisplayData = isComparisonTab ? dataForComparisonTable : processedData;
    const currentDisplayColumns = isComparisonTab ? comparisonTableColumns : currentTableColumns;
    const currentGrandTotal = isComparisonTab ? grandTotalForComparisonTable : grandTotalRow;


    if (currentDisplayData.length === 0 && rawData.length > 0 && hasAppliedFilters && !isComparisonTab ) { 
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
     if (currentDisplayData.length === 0 && rawData.length > 0 && hasAppliedFilters && isComparisonTab) {
        return (
          <Card className="flex-1">
            <CardHeader>
                <CardTitle>Comparison - No Data Matches Filters</CardTitle>
                <CardDescription>Adjust your filters to see data for comparison.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center text-muted-foreground flex flex-col justify-center items-center h-full">
                <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
              <p>Your filter selection for "<strong>{rawFileName}</strong>" resulted in no data to compare.</p>
              <p>Please try adjusting your filters.</p>
            </CardContent>
          </Card>
        );
    }
    
    if (isComparisonTab) {
        return (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="flex justify-end">
                <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || isLoadingActualSpeciesFile || dataForComparisonTable.length === 0 || !hasAppliedFilters || !selectedComparisonColumn}>
                    {isLoading || isLoadingActualSpeciesFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download Comparison PDF
                </Button>
            </div>
            <Card className="p-4">
                <CardTitle className="text-lg mb-2">Actual Species Count Upload</CardTitle>
                <CardDescription className="mb-4">Upload an Excel file with actual species counts. Expected columns: site_name, section_name, user_enclosure_name, common_name, actual_animal_count (case-sensitive, underscore-separated).</CardDescription>
                <FileUpload
                    onFileSelected={handleActualSpeciesFileSelectedCallback}
                    onProcessing={setIsLoadingActualSpeciesFile}
                    disabled={isLoadingActualSpeciesFile || !hasAppliedFilters}
                />
                 {parsedActualSpeciesData.length > 0 && (
                    <p className="text-sm text-green-600 mt-2">"{actualSpeciesFileName}" loaded with {parsedActualSpeciesData.length} rows. Data merged into table below if context matches.</p>
                )}
                 {parsedActualSpeciesData.length === 0 && actualSpeciesFileName !== "species_counts" && !isLoadingActualSpeciesFile && (
                    <p className="text-sm text-orange-600 mt-2">"{actualSpeciesFileName}" loaded, but no data rows were extracted or could be mapped. Ensure file format and headers are correct.</p>
                )}
            </Card>
            <Separator />
            <Card className="p-4">
              <CardTitle className="text-lg mb-2">Ingredient Quantity Comparison</CardTitle>
              <div className="flex items-center gap-4">
                <Label htmlFor="comparison-column-select" className="text-sm font-medium whitespace-nowrap">
                  Select Planned Ingredient Quantity Column:
                </Label>
                <Select
                  value={selectedComparisonColumn || ""}
                  onValueChange={(value) => setSelectedComparisonColumn(value === "none" ? null : value)}
                  disabled={numericColumnsForComparison.length === 0 || isLoadingActualSpeciesFile}
                >
                  <SelectTrigger id="comparison-column-select" className="min-w-[200px] max-w-xs">
                    <SelectValue placeholder="Choose column for comparison" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumnsForComparison.length > 0 ? (
                      numericColumnsForComparison.map(col => (
                        <SelectItem key={col} value={col}>{col.replace(/_/g, ' ')}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No numeric columns available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {(selectedComparisonColumn) ? ( 
              <div className="flex-1 min-h-0">
                <DataTable 
                  data={dataForComparisonTable} 
                  columns={comparisonTableColumns} 
                  grandTotalRow={grandTotalForComparisonTable}
                  isComparisonMode={!!selectedComparisonColumn} 
                  comparisonColumn={selectedComparisonColumn} 
                  actualQuantities={actualComparisonQuantities}
                  onActualQuantityChange={handleActualQuantityChange}
                  actualGroupQuantities={actualGroupReceivedQuantities}
                  onActualGroupQuantityChange={handleActualGroupReceivedChange}
                  groupingOptions={groupings}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Columns className="h-12 w-12 text-primary/50 mx-auto mb-4" />
                  <p>Please select a numeric column for ingredient quantity comparison.</p>
                </CardContent>
              </Card>
            )}
          </div>
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
                        const tempRowArray = [row];
                        const valueAfterProcessing = calculateProcessedTableData(tempRowArray, [], [], [filter], allHeaders, true).filteredData[0]?.[filter.column];
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
                          <DataTable 
                            data={sectionTableData.processedData} 
                            columns={sectionTableData.columns} 
                            grandTotalRow={sectionTableData.grandTotalRow} 
                            groupingOptions={groupings}
                            isComparisonMode={false} 
                            comparisonColumn={null} 
                            actualQuantities={{}} 
                            onActualQuantityChange={undefined} 
                            actualGroupQuantities={{}}
                            onActualGroupQuantityChange={undefined}
                          />
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
    } else { // View Data Tab
      return (
        <div className="flex-1 min-h-0">
          <DataTable 
            data={currentDisplayData} 
            columns={currentDisplayColumns} 
            grandTotalRow={currentGrandTotal} 
            groupingOptions={groupings}
            isComparisonMode={false} 
            comparisonColumn={null} 
            actualQuantities={{}} 
            onActualQuantityChange={undefined} 
            actualGroupQuantities={{}}
            onActualGroupQuantityChange={undefined}
          />
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
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-4">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><FileSpreadsheet className="h-4 w-4"/>Upload Excel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
            <TabsTrigger value="comparison" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><BarChartHorizontalBig className="h-4 w-4"/>Comparison</TabsTrigger>
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
                    groupings={groupings}
                    setGroupings={setGroupings}
                    summaries={summaries}
                    setSummaries={setSummaries}
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
                    groupings={groupings}
                    setGroupings={setGroupings}
                    summaries={summaries}
                    setSummaries={setSummaries}
                />
                {renderContentForDataTabs(true)}
              </div>
          </TabsContent>

          <TabsContent value="comparison" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4">
                 <InteractiveFilters
                    rawData={rawData} 
                    allHeaders={allHeaders}
                    appliedFilters={filters}
                    onApplyFilters={handleApplyFiltersCallback}
                    disabled={isLoading || !isFileSelected || isLoadingActualSpeciesFile}
                    groupings={groupings}
                    setGroupings={setGroupings}
                    summaries={summaries}
                    setSummaries={setSummaries}
                />
                {renderContentForDataTabs(false, true)}
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
    
