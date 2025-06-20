
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2, BarChartHorizontalBig, Columns, Users, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTableProcessor, calculateProcessedTableData, type ProcessedTableData } from '@/hooks/useTableProcessor';
import type { DietDataRow, GroupingOption, SummarizationOption, FilterOption } from '@/types';
import {
    DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS,
    DEFAULT_IMAGE_PIVOT_SUMMARIES, // Used for default views
    PIVOT_BLANK_MARKER,
    SPECIAL_PIVOT_UOM_ROW_GROUPINGS,
    SPECIAL_PIVOT_UOM_COLUMN_FIELD,
    SPECIAL_PIVOT_UOM_VALUE_FIELD,
} from '@/types';
import FileUpload from '@/components/FileUpload';
import DataTable from '@/components/DataTable';
import SimpleFilterPanel from '@/components/SimpleFilterPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import DietWiseLogo from '@/components/DietWiseLogo';
import { exportToPdf } from '@/lib/pdfUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table as ShadcnTable, TableBody as ShadcnTableBody, TableCell as ShadcnTableCell, TableHead as ShadcnTableHead, TableHeader as ShadcnTableHeader, TableRow as ShadcnTableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

interface ComparisonIngredient {
  name: string;
  plannedQty: number;
  plannedQtyDisplay: string;
  uom: string;
}

interface SpeciesGroupComparisonData {
  groupKey: string;
  groupDisplayItems: { label: string; value: string | number | undefined }[];
  ingredients: ComparisonIngredient[];
  animalCount?: number; // Keep this for display
}

// Fixed groupings and summaries for the new Comparison Tab logic
const COMPARISON_FIXED_GROUPINGS: GroupingOption[] = [
  { column: 'site_name' },
  { column: 'section_name' },
  { column: 'group_name' },
  { column: 'common_name' },
  { column: 'meal_time' },
  { column: 'ingredient_name' },
];

const COMPARISON_FIXED_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'sum' },
  { column: 'base_uom_name', type: 'first' },
  { column: 'total_animal', type: 'first' },
];

// Default summaries for "View Data" and "Export Sections" tabs
// This will revert to a simpler default state without guaranteed UoM in these views unless manually added by user.
const DEFAULT_SUMMARIES_FOR_VIEW_EXPORT: SummarizationOption[] = [
    ...DEFAULT_IMAGE_PIVOT_SUMMARIES.filter(s => s.column === 'ingredient_qty'),
    { column: 'total_animal', type: 'first' } // For consistent animal count display
];


export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploadExcel");

  const [rawFileBase64, setRawFileBase64] = useState<string | null>(null);
  const [rawFileName, setRawFileName] = useState<string>("report");

  const [rawData, setRawData] = useState<DietDataRow[]>([]);
  const [allHeaders, setAllHeaders] = useState<string[]>([]);

  const [defaultGroupings, setDefaultGroupings] = useState<GroupingOption[]>(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
  const [defaultSummaries, setDefaultSummaries] = useState<SummarizationOption[]>(DEFAULT_SUMMARIES_FOR_VIEW_EXPORT);

  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isFileSelected, setIsFileSelected] = useState(false);

  // State for Comparison Tab
  const [actualComparisonQuantities, setActualComparisonQuantities] = useState<Record<string, string>>({});
  const [selectedComparisonColumn, setSelectedComparisonColumn] = useState<string | null>(null);
  const [structuredComparisonData, setStructuredComparisonData] = useState<SpeciesGroupComparisonData[]>([]);

  const [parsedActualSpeciesData, setParsedActualSpeciesData] = useState<DietDataRow[]>([]);
  const [isLoadingActualSpeciesFile, setIsLoadingActualSpeciesFile] = useState<boolean>(false);
  const [actualSpeciesFileName, setActualSpeciesFileName] = useState<string>("species_counts");


  const { toast } = useToast();

  const { processedData, columns: currentTableColumns, grandTotalRow, filteredData } = useTableProcessor({
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
        setActualComparisonQuantities({});
        setParsedActualSpeciesData([]);
        setStructuredComparisonData([]);
    }
  }, [isFileSelected, rawData]);


  useEffect(() => {
    if (activeTab === "comparison" && hasAppliedFilters && rawData.length > 0 && selectedComparisonColumn) {
      setIsLoading(true);
      try {
        // For comparison, we need un-blanked data with specific groupings
        const comparisonSourceProcessed = calculateProcessedTableData(
          rawData,
          COMPARISON_FIXED_GROUPINGS,
          COMPARISON_FIXED_SUMMARIES,
          filters, // Apply global filters to the source data
          allHeaders,
          true,
          true // disableDisplayBlanking = true
        );

        const groupMap = new Map<string, SpeciesGroupComparisonData>();
        const groupContextColumns = ['site_name', 'section_name', 'group_name', 'common_name', 'meal_time'];

        comparisonSourceProcessed.processedData.forEach(row => {
          const currentGroupContext: Record<string, any> = {};
          let dynamicGroupContextKey = "";

          groupContextColumns.forEach(col => {
            const val = String(row[col] || ''); // Use raw values
            currentGroupContext[col] = val;
            if (val) dynamicGroupContextKey += `${val}||`;
          });
          dynamicGroupContextKey = dynamicGroupContextKey.endsWith('||') ? dynamicGroupContextKey.slice(0, -2) : dynamicGroupContextKey;
          const groupKey = dynamicGroupContextKey || `group_${groupMap.size}`;


          const ingredientName = String(row['ingredient_name'] || 'Unknown Ingredient');
          // selectedComparisonColumn is like 'ingredient_qty_sum'. We need the raw planned quantity.
          // The `comparisonSourceProcessed.processedData` rows are already summarized per ingredient.
          const plannedQtyValue = row[selectedComparisonColumn!] as number | undefined; // This will be the summarized value for the ingredient.
          const uomValue = row['base_uom_name_first'] as string | undefined; // From COMPARISON_FIXED_SUMMARIES
          let animalCountValue = row['total_animal_first'] as number | undefined; // From COMPARISON_FIXED_SUMMARIES

          if (plannedQtyValue === undefined || typeof plannedQtyValue !== 'number' ) {
            return; // Skip if no planned quantity for this ingredient in this context
          }

          if (!groupMap.has(groupKey)) {
            const groupDisplayItems: {label: string, value: string | number | undefined}[] = [];
            if (currentGroupContext['site_name']) groupDisplayItems.push({label: "Site", value: currentGroupContext['site_name']});
            if (currentGroupContext['section_name']) groupDisplayItems.push({label: "Section", value: currentGroupContext['section_name']});
            if (currentGroupContext['group_name']) groupDisplayItems.push({label: "Group", value: currentGroupContext['group_name']});
            if (currentGroupContext['common_name']) groupDisplayItems.push({label: "Species", value: currentGroupContext['common_name']});
            if (currentGroupContext['meal_time']) groupDisplayItems.push({label: "Meal", value: currentGroupContext['meal_time']});

            // Animal count from parsedActualSpeciesData (if available)
            if (parsedActualSpeciesData.length > 0) {
                const speciesContextKeys = ['site_name', 'section_name', 'group_name', 'common_name'];
                let matchScore = 0;
                let bestMatchCount: number | undefined = undefined;

                parsedActualSpeciesData.forEach(speciesRow => {
                    let currentScore = 0;
                    let potentiallyMissingContext = false;
                    for (const key of speciesContextKeys) {
                        if (currentGroupContext[key] !== undefined && speciesRow[key] !== undefined) {
                            if (String(currentGroupContext[key]).toLowerCase() === String(speciesRow[key]).toLowerCase()) {
                                currentScore++;
                            } else {
                                currentScore = -1; // Mismatch, invalidate this speciesRow for current context
                                break;
                            }
                        } else if (currentGroupContext[key] === undefined && speciesRow[key] !== undefined && String(speciesRow[key]).trim() !== '') {
                             potentiallyMissingContext = true; // Current context is less specific than speciesRow
                        }
                    }

                    if (currentScore > matchScore && !potentiallyMissingContext) {
                        matchScore = currentScore;
                        const count = parseFloat(String(speciesRow['actual_animal_count']));
                        if (!isNaN(count)) bestMatchCount = count;
                    } else if (currentScore === matchScore && !potentiallyMissingContext && bestMatchCount === undefined) {
                        // If scores are equal, prefer the one that gives a count if current bestMatchCount is undefined
                        const count = parseFloat(String(speciesRow['actual_animal_count']));
                        if (!isNaN(count)) bestMatchCount = count;
                    }
                });
                if (bestMatchCount !== undefined) animalCountValue = bestMatchCount;
            }


            if (animalCountValue !== undefined && !groupDisplayItems.some(item => item.label === "Animals")) {
                 groupDisplayItems.push({label: "Animals", value: animalCountValue});
            }


            groupMap.set(groupKey, {
              groupKey,
              groupDisplayItems,
              ingredients: [],
              animalCount: animalCountValue,
            });
          }

          const groupData = groupMap.get(groupKey)!;
           // Update animal count if it was initially undefined for the group but found now
          if (groupData.animalCount === undefined && animalCountValue !== undefined) {
              groupData.animalCount = animalCountValue;
              // Ensure "Animals" is in groupDisplayItems if count becomes available
              if (!groupData.groupDisplayItems.some(item => item.label === "Animals")) {
                  groupData.groupDisplayItems.push({label: "Animals", value: animalCountValue });
              } else {
                  // Update existing "Animals" item if it was somehow added before with no value
                  const animalItem = groupData.groupDisplayItems.find(item => item.label === "Animals");
                  if (animalItem) animalItem.value = animalCountValue;
              }
          }


          groupData.ingredients.push({
            name: ingredientName,
            plannedQty: plannedQtyValue,
            plannedQtyDisplay: `${plannedQtyValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uomValue || ''}`.trim(),
            uom: uomValue || '',
          });
        });

        // Sort ingredients within each group
        groupMap.forEach(group => {
          group.ingredients.sort((a, b) => a.name.localeCompare(b.name));
        });

        // Sort groups
        const sortedGroupData = Array.from(groupMap.values()).sort((a,b) => {
            const aSite = a.groupDisplayItems.find(i=>i.label==="Site")?.value || '';
            const bSite = b.groupDisplayItems.find(i=>i.label==="Site")?.value || '';
            if (aSite !== bSite) return String(aSite).localeCompare(String(bSite));

            const aSection = a.groupDisplayItems.find(i=>i.label==="Section")?.value || '';
            const bSection = b.groupDisplayItems.find(i=>i.label==="Section")?.value || '';
            if (aSection !== bSection) return String(aSection).localeCompare(String(bSection));

            const aGroup = a.groupDisplayItems.find(i=>i.label==="Group")?.value || '';
            const bGroup = b.groupDisplayItems.find(i=>i.label==="Group")?.value || '';
            if (aGroup !== bGroup) return String(aGroup).localeCompare(String(bGroup));

            const aSpecies = a.groupDisplayItems.find(i=>i.label==="Species")?.value || '';
            const bSpecies = b.groupDisplayItems.find(i=>i.label==="Species")?.value || '';
            if (aSpecies !== bSpecies) return String(aSpecies).localeCompare(String(bSpecies));
            
            const aMeal = a.groupDisplayItems.find(i=>i.label==="Meal")?.value || '';
            const bMeal = b.groupDisplayItems.find(i=>i.label==="Meal")?.value || '';
            return String(aMeal).localeCompare(String(bMeal));
        });

        setStructuredComparisonData(sortedGroupData);
      } catch(e) {
        console.error("Error processing comparison data:", e);
        toast({variant: "destructive", title: "Comparison Data Error", description: "Could not structure data for comparison."});
        setStructuredComparisonData([]);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === "comparison" && (!hasAppliedFilters || rawData.length === 0 || !selectedComparisonColumn)) {
        // Clear comparison data if conditions aren't met
        setStructuredComparisonData([]);
    }
  }, [activeTab, hasAppliedFilters, rawData, filters, allHeaders, selectedComparisonColumn, toast, parsedActualSpeciesData]);


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
    setActiveTab("extractedData"); // Switch to a data tab after upload
    setActualComparisonQuantities({});
    setParsedActualSpeciesData([]);
    setStructuredComparisonData([]); // Clear comparison specific data

    toast({
        title: "File Selected",
        description: `"${cleanFileName}" is ready. Apply filters to process and view data.`,
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
                description: `"${fileName}" processed with ${result.parsedData.length} rows. This data can enhance animal counts in the Comparison tab.`,
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
    setActualComparisonQuantities({}); // Reset actuals when filters change

    try {
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            setStructuredComparisonData([]); // Clear comparison specific data
            setIsLoading(false);
            return;
        }

        setRawData(result.parsedData);
        setAllHeaders(result.headers);

        // Determine default groupings and summaries for "View Data" and "Export Sections"
        const requiredDefaultPivotCols = [
            ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
            ...DEFAULT_SUMMARIES_FOR_VIEW_EXPORT.map(s => s.column)
        ];
        const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => result.headers.includes(col as string));

        if (canApplyDefaultImagePivot) {
            setDefaultGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
            setDefaultSummaries(DEFAULT_SUMMARIES_FOR_VIEW_EXPORT);
        } else {
            // Fallback for groupings and summaries if default image pivot can't be applied
            const canApplySpecialUOMPivot =
                SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => result.headers.includes(col as string)) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD as string) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD as string);

            if (canApplySpecialUOMPivot) {
                setDefaultGroupings(SPECIAL_PIVOT_UOM_ROW_GROUPINGS.map(col => ({ column: col as string })));
                setDefaultSummaries([{ column: SPECIAL_PIVOT_UOM_VALUE_FIELD as string, type: 'sum' }]);
            } else {
                const fallbackGroupingCandidates = ['group_name', 'common_name', 'ingredient_name'];
                const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => result.headers.includes(h as string));
                setDefaultGroupings(availableFallbackGroupings.length > 0
                    ? availableFallbackGroupings.slice(0,2).map(col => ({ column: col as string }))
                    : result.headers.length > 0 ? [{ column: result.headers[0] }] : []);
                
                // Fallback summaries - try to find common numeric columns
                const fallbackSummaries: SummarizationOption[] = [];
                if (result.headers.includes('ingredient_qty')) {
                    fallbackSummaries.push({ column: 'ingredient_qty', type: 'sum' });
                }
                 if (result.headers.includes('base_uom_name')) { // Add UOM for potential display
                    fallbackSummaries.push({ column: 'base_uom_name', type: 'first'});
                }
                if (result.headers.includes('total_animal')) {
                    fallbackSummaries.push({ column: 'total_animal', type: 'first'});
                }
                setDefaultSummaries(fallbackSummaries.length > 0 ? fallbackSummaries : (result.headers.length > 0 ? [{column: result.headers[0], type: 'count'}] : []));
            }
        }

        setFilters(newFilters);
        setHasAppliedFilters(true);

        // Auto-select a default comparison column if none is selected yet
        // This logic remains to select an initial column for the Comparison tab's planned qty
        if (!selectedComparisonColumn) {
           const potentialCols = COMPARISON_FIXED_SUMMARIES.map(s => `${s.column}_${s.type}`);
           const firstPotentialCol = potentialCols.find(pc => pc.startsWith('ingredient_qty_') && pc.endsWith('_sum'));
           // Ensure the original column ('ingredient_qty') exists in the headers before setting.
           if (firstPotentialCol && result.headers.includes('ingredient_qty')) { // Check original column
                setSelectedComparisonColumn(firstPotentialCol);
           }
        }
        
        if (result.parsedData.length === 0 && result.headers.length > 0) {
            toast({ variant: "default", title: "File Parsed: Contains Only Headers", description: "The Excel file seems to contain only headers and no data rows. Filters applied."});
        } else if (result.parsedData.length === 0 && result.headers.length === 0 ) {
            toast({ variant: "destructive", title: "No Data Extracted", description: "Could not extract any data or headers from the file. Please check the file format."});
        } else {
             toast({
                title: "Filters Applied, Data Processed",
                description: `"${rawFileName}" processed. View data or switch to Comparison tab.`,
            });
        }

    } catch (error) {
        console.error("Error during 'Apply Filters' (including parsing):", error);
        toast({ variant: "destructive", title: "Processing Error", description: "An unexpected error occurred while parsing or filtering the file." });
        setRawData([]);
        setAllHeaders([]);
        setStructuredComparisonData([]); // Clear comparison data on error
    } finally {
        setIsLoading(false);
    }
  }, [isFileSelected, rawFileBase64, rawFileName, toast, selectedComparisonColumn]);


  const handleDownloadAllPdf = () => {
    if (activeTab === "comparison") {
        if (!selectedComparisonColumn) {
            toast({ variant: "destructive", title: "Cannot Export", description: "Please select an ingredient quantity column for comparison before exporting." });
            return;
        }
        if (!hasAppliedFilters || structuredComparisonData.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "No data available to export for comparison. Apply filters and select a comparison column first." });
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        doc.setFontSize(18);
        doc.text(`Comparison Report - ${rawFileName}`, 40, 30);
        let firstPage = true;

        structuredComparisonData.forEach((groupData, index) => {
            if (!firstPage) {
                doc.addPage();
            }
            firstPage = false;

            const startY = firstPage && index === 0 ? 50 : 40; // Adjust startY for subsequent pages

            // Group Header
            let groupHeaderText = groupData.groupDisplayItems.map(item => `${item.label}: ${item.value}`).join(' | ');
            if (groupData.animalCount !== undefined) {
                groupHeaderText += ` | Animals: ${groupData.animalCount}`;
            }
            doc.setFontSize(12);
            doc.text(groupHeaderText, 40, startY);

            // Ingredients Table for this group
            const head = [['Ingredient Name', 'Planned Qty', 'Actual Qty', `Difference (${selectedComparisonColumn.replace(/_/g, ' ')})`]];
            const body = groupData.ingredients.map(ing => {
                const actualKey = `${groupData.groupKey}||${ing.name}||${selectedComparisonColumn!}`;
                const actualQtyStr = actualComparisonQuantities[actualKey] || '';
                const actualQtyNum = parseFloat(actualQtyStr);
                const plannedQtyNum = ing.plannedQty;
                let diffStr = '';
                if (actualQtyStr !== '' && !isNaN(actualQtyNum) && !isNaN(plannedQtyNum)) {
                    const diffNum = actualQtyNum - plannedQtyNum;
                    diffStr = parseFloat(diffNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                }
                return [
                    ing.name,
                    ing.plannedQtyDisplay, // Already includes UoM
                    actualQtyStr !== '' && !isNaN(actualQtyNum) ? actualQtyNum.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4}) : '', // Display UoM here if desired based on ing.uom
                    diffStr
                ];
            });

            autoTable(doc, {
                head: head,
                body: body,
                startY: startY + 20, // Space after group header
                theme: 'striped',
                headStyles: { fillColor: [38, 153, 153], textColor: [255,255,255] }, // Example primary color
                styles: { fontSize: 8, cellPadding: 3, overflow: 'ellipsize' },
                columnStyles: {
                    0: { cellWidth: 'auto' }, // Ingredient Name
                    1: { halign: 'right', cellWidth: 'auto' }, // Planned Qty
                    2: { halign: 'right', cellWidth: 'auto' }, // Actual Qty
                    3: { halign: 'right', cellWidth: 'auto' }  // Difference
                },
                didParseCell: function (data) {
                    // Color difference column
                    if (data.column.index === 3) { // Difference column
                         const cellRawValue = data.cell.raw;
                         if (cellRawValue !== null && cellRawValue !== undefined) {
                            const cellStringValue = String(cellRawValue).trim().replace(/,/g, ''); // Remove commas for parsing
                            if (cellStringValue !== '') {
                                const numericValue = parseFloat(cellStringValue);
                                if (!isNaN(numericValue)) {
                                    if (numericValue < 0) data.cell.styles.textColor = [220, 53, 69]; // Red
                                    else if (numericValue > 0) data.cell.styles.textColor = [0, 123, 255]; // Blue
                                }
                            }
                        }
                    }
                },
                didDrawPage: (data) => {
                    doc.setFontSize(8);
                    doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 60, doc.internal.pageSize.height - 20);
                },
            });
        });
        doc.save(`${rawFileName}_comparison_report.pdf`);
        toast({ title: "PDF Download Started", description: `Your Comparison report PDF is being generated.` });
        return;
    }

    // PDF export for "View Data" and "Export Sections" (remains largely the same)
    let dataToExport: DietDataRow[] = [];
    let columnsToExport: string[] = [];
    let grandTotalToExport: DietDataRow | undefined = undefined;

    if (activeTab === "extractedData" || activeTab === "exportSections") {
        dataToExport = processedData.map(row => ({...row})); // Use copies
        columnsToExport = [...currentTableColumns]; // Use copies
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined; // Use copy

        // UoM concatenation for PDF export - this assumes DataTable's UoM display logic is what's desired
        const ingredientQtySumKey = columnsToExport.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
        const uomKey = columnsToExport.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));


        if (ingredientQtySumKey && uomKey && allHeaders.includes('base_uom_name')) { // Check if original UoM header exists
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
             // Remove the separate UoM column if concatenation happened and it's not the same as qty column
             if (uomKey !== ingredientQtySumKey) { // Check if they are different columns
                columnsToExport = columnsToExport.filter(c => c !== uomKey);
            }
        }
    }

    const currentTabTitleSuffix = activeTab === "exportSections" ? "Section Report" : "Full Diet Report";
    if ((activeTab === "extractedData" || activeTab === "exportSections") && dataToExport.length > 0 && columnsToExport.length > 0 && hasAppliedFilters) {
      exportToPdf(dataToExport, columnsToExport, `${currentTabTitleSuffix} - ${rawFileName}`, `${rawFileName}_${activeTab === "exportSections" ? "section" : "full"}_report`, grandTotalToExport);
      toast({ title: "PDF Download Started", description: `Your ${currentTabTitleSuffix} PDF is being generated.` });
    } else if ((activeTab === "extractedData" || activeTab === "exportSections") && (!hasAppliedFilters || dataToExport.length === 0)) {
      toast({ variant: "destructive", title: "No Data", description: "No data available to export. Apply filters to view data first." });
    }
  };


  const handleDownloadSectionPdf = (sectionName: string, sectionTableDataInput: ProcessedTableData) => {
     // Create deep copies to avoid mutating original state from useTableProcessor
     const sectionTableData = {
         processedData: sectionTableDataInput.processedData.map(row => ({...row})),
         columns: [...sectionTableDataInput.columns],
         grandTotalRow: sectionTableDataInput.grandTotalRow ? {...sectionTableDataInput.grandTotalRow} : undefined
     };

     // UoM concatenation logic for section PDF (similar to above)
     const ingredientQtySumKey = sectionTableData.columns.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
     const uomKey = sectionTableData.columns.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));


     if (ingredientQtySumKey && uomKey && allHeaders.includes('base_uom_name')) { // Check original UoM header
        sectionTableData.processedData = sectionTableData.processedData.map(row => {
            const newRow = {...row}; // Work on a copy
            const qty = newRow[ingredientQtySumKey];
            const uom = newRow[uomKey]; // Use newRow to get potentially blanked UoM if that's the desired display logic from table
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (sectionTableData.grandTotalRow && typeof sectionTableData.grandTotalRow[ingredientQtySumKey] === 'number') {
            const qty = sectionTableData.grandTotalRow[ingredientQtySumKey] as number;
            const uom = sectionTableData.grandTotalRow[uomKey]; // Use grandTotalRow for its UoM
             if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 sectionTableData.grandTotalRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
        // Remove the separate UoM column if concatenation happened and it's not the same as qty column
        if (uomKey !== ingredientQtySumKey) {
            sectionTableData.columns = sectionTableData.columns.filter(c => c !== uomKey);
        }
     }

     if (sectionTableData.processedData.length > 0 && sectionTableData.columns.length > 0 && hasAppliedFilters) {
      exportToPdf(sectionTableData.processedData, sectionTableData.columns, `Section Report: ${sectionName} - ${rawFileName}`, `${rawFileName}_section_${sectionName.replace(/\s+/g, '_')}`, sectionTableData.grandTotalRow);
      toast({ title: "PDF Download Started", description: `PDF for section ${sectionName} is being generated.` });
    } else {
      toast({ variant: "destructive", title: "No Data", description: `No data available to export for section ${sectionName}. Ensure filters are applied.` });
    }
  };

  const handleActualQuantityChange = useCallback((groupKey: string, ingredientName: string, comparisonCol: string, value: string) => {
    setActualComparisonQuantities(prev => ({
      ...prev,
      // Ensure the key structure matches how it's used when retrieving in rendering
      [`${groupKey}||${ingredientName}||${comparisonCol}`]: value,
    }));
  }, []);


  const year = new Date().getFullYear();

  // Numeric columns for the comparison dropdown
  const numericColumnsForComparison = useMemo(() => {
    if (!rawData.length || !allHeaders.length || !hasAppliedFilters) return [];
    
    // Use COMPARISON_FIXED_SUMMARIES to determine suitable columns for comparison,
    // as these are the summaries applied when generating data for the comparison tab.
    // The columns in the dropdown should reflect quantities available for comparison.
    // calculateProcessedTableData with COMPARISON_FIXED_GROUPINGS and SUMMARIES will produce these columns.
    const tempProcessedForCols = calculateProcessedTableData(
        rawData, // Use rawData with current global filters
        COMPARISON_FIXED_GROUPINGS, // Groupings used for comparison tab structure
        COMPARISON_FIXED_SUMMARIES, // Summaries used for comparison tab structure
        filters, // Current global filters
        allHeaders,
        true, // hasAppliedFilters
        true  // disableDisplayBlanking true to get raw column names
    );

    return tempProcessedForCols.columns.filter(col => {
        // Filter for columns that represent a summarized numeric quantity, e.g., 'ingredient_qty_sum'
        const summaryMatch = col.match(/^([a-zA-Z0-9_]+)_(sum|average|max)$/);
        if (summaryMatch) {
            const originalColName = summaryMatch[1];
            // Check if this column comes from one of our fixed summaries for comparison and is numeric
            if (COMPARISON_FIXED_SUMMARIES.find(s => s.column === originalColName && ['sum', 'average', 'max'].includes(s.type)) ) {
                return true;
            }
        }
        return false;
    }).sort();
  }, [rawData, allHeaders, filters, hasAppliedFilters]);


  const handlePrepareSaveData = () => {
    if (!selectedComparisonColumn || structuredComparisonData.length === 0) {
        toast({ variant: "destructive", title: "No Data to Prepare", description: "Please select a comparison column and ensure data is processed." });
        return;
    }

    const dataToSave: any[] = [];
    structuredComparisonData.forEach(groupData => {
        const groupContextForSave: Record<string, any> = {};
        // Extract context from groupDisplayItems, matching expected backend fields
        groupData.groupDisplayItems.forEach(item => {
            if (item.label.toLowerCase() === 'site') groupContextForSave.site_name = item.value;
            else if (item.label.toLowerCase() === 'section') groupContextForSave.section_name = item.value;
            else if (item.label.toLowerCase() === 'group') groupContextForSave.group_id = item.value; // Assuming group_id from group_name
            else if (item.label.toLowerCase() === 'species') groupContextForSave.species = item.value;
            else if (item.label.toLowerCase() === 'meal') groupContextForSave.meal_time = item.value;
        });

        const groupRecord: any = {
            group_id: groupContextForSave.group_id || groupData.groupDisplayItems.find(item => item.label === "Group")?.value || "Unknown Group", // Fallback
            site_name: groupContextForSave.site_name,
            section_name: groupContextForSave.section_name,
            species: groupContextForSave.species || groupData.groupDisplayItems.find(item => item.label === "Species")?.value, // Fallback
            meal_time: groupContextForSave.meal_time,
            animal_count: groupData.animalCount, // Add animal count
            ingredients: [],
        };

        groupData.ingredients.forEach(ing => {
            const actualKey = `${groupData.groupKey}||${ing.name}||${selectedComparisonColumn!}`;
            const actualQtyStr = actualComparisonQuantities[actualKey] || '';
            const actualQtyNum = parseFloat(actualQtyStr);

            groupRecord.ingredients.push({
                name: ing.name,
                planned_qty: ing.plannedQty,
                planned_uom: ing.uom, // Store planned UOM
                actual_qty: actualQtyStr !== '' && !isNaN(actualQtyNum) ? actualQtyNum : null,
                actual_uom: ing.uom, // Assume actual UOM is same as planned for now
            });
        });
        dataToSave.push(groupRecord);
    });

    const jsonData = JSON.stringify(dataToSave, null, 2);
    console.log("Data prepared for saving (JSON):", jsonData);
    toast({
        title: "Data Prepared for Backend",
        description: "Check the browser console for the JSON data. Implement backend logic to save this.",
        duration: 10000,
    });
  };


  const renderContentForDataTabs = (isExportTab: boolean, isComparisonTab: boolean = false) => {
    if (isLoading && !isComparisonTab) { // General loading for View/Export
      return (
        <Card><CardHeader><CardTitle>Processing...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
      );
    }
     if (isComparisonTab && isLoading) { // Specific loading for Comparison data structuring
      return (
        <Card><CardHeader><CardTitle>Structuring Comparison Data...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
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
            <p>Please click "Apply Filters" to process and view the data.</p>
          </CardContent>
        </Card>
      );
    }

    // Messages for "View Data" and "Export Sections" tabs
    if (!isComparisonTab) {
        if (rawData.length === 0 && allHeaders.length > 0 && hasAppliedFilters) { // Only headers in file
            return <Card><CardContent className="p-6 text-center text-muted-foreground">File "<strong>{rawFileName}</strong>" contains only headers.</CardContent></Card>;
        }
        if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) { // No data or headers
            return <Card><CardContent className="p-6 text-center text-destructive">No data or headers extracted from "<strong>{rawFileName}</strong>".</CardContent></Card>;
        }
        // This uses `processedData` from the default `useTableProcessor`
        if (processedData.length === 0 && rawData.length > 0 && hasAppliedFilters ) { // Filters result in no data for current view
           return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the current view.</CardContent></Card>;
        }
    }


    if (isComparisonTab) {
        if (isLoadingActualSpeciesFile) {
            return <Card><CardHeader><CardTitle>Loading Species File...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>;
        }
        // This uses `structuredComparisonData`
        if (structuredComparisonData.length === 0 && rawData.length > 0 && hasAppliedFilters && selectedComparisonColumn) {
            return (
              <Card className="flex-1">
                <CardHeader>
                    <CardTitle>Comparison - No Data Matches Filters or Structure</CardTitle>
                    <CardDescription>Adjust filters or check data. Ensure group, species, and ingredient columns are present, and the selected quantity column is appropriate.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 text-center text-muted-foreground">
                    <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto mb-4" />
                    <p>No data could be structured for group comparison. This might be due to filters, or missing/mismatched context columns (like Site, Section, Group, Species, Meal Time, Ingredient) in your Excel file for the selected planned quantity column.</p>
                </CardContent>
              </Card>
            );
        }
        return (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Controls for Comparison Tab */}
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="comparison-column-select" className="text-sm font-medium">
                    Select Planned Ingredient Quantity Column for Comparison:
                  </Label>
                  <Select
                    value={selectedComparisonColumn || ""}
                    onValueChange={(value) => setSelectedComparisonColumn(value === "none" ? null : value)}
                    disabled={numericColumnsForComparison.length === 0 || isLoading}
                  >
                    <SelectTrigger id="comparison-column-select" className="min-w-[250px] max-w-sm">
                      <SelectValue placeholder="Choose planned quantity column..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumnsForComparison.length > 0 ? (
                        numericColumnsForComparison.map(col => (
                          <SelectItem key={col} value={col}>{col.replace(/_/g, ' ')}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No suitable numeric columns found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-end space-y-2">
                     <FileUpload
                        onFileSelected={handleActualSpeciesFileSelectedCallback}
                        onProcessing={setIsLoadingActualSpeciesFile} // Separate loading state
                        disabled={isLoadingActualSpeciesFile || !hasAppliedFilters} // Disable if already loading or no main file processed
                    />
                    {parsedActualSpeciesData.length > 0 && (
                        <p className="text-xs text-green-600">"{actualSpeciesFileName}" loaded ({parsedActualSpeciesData.length} rows).</p>
                    )}
                </div>
                <div className="flex flex-col items-end space-y-2">
                    <Button onClick={handlePrepareSaveData} size="sm" variant="outline" disabled={isLoading || structuredComparisonData.length === 0 || !hasAppliedFilters || !selectedComparisonColumn}>
                        <Save className="mr-2 h-4 w-4" /> Prepare Save Data
                    </Button>
                    <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || structuredComparisonData.length === 0 || !hasAppliedFilters || !selectedComparisonColumn}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
            </div>
            <Separator />

            {!selectedComparisonColumn ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Columns className="h-12 w-12 text-primary/50 mx-auto mb-4" />
                  <p>Please select a "Planned Ingredient Quantity Column" above to enable comparison.</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="flex-1 -mx-4 px-4"> {/* Added ScrollArea */}
                <div className="space-y-6">
                {structuredComparisonData.map((group) => (
                    <Card key={group.groupKey} className="overflow-hidden">
                        <CardHeader className="bg-muted/50 p-4">
                            <CardTitle className="text-base">
                                {group.groupDisplayItems.map((item, idx) => (
                                    <span key={idx} className="mr-2 pr-2 border-r last:border-r-0 last:mr-0 last:pr-0 border-muted-foreground/30 text-sm">
                                        <span className="font-normal text-xs text-muted-foreground">{item.label}: </span>
                                        {String(item.value)}
                                    </span>
                                ))}
                                {group.animalCount !== undefined && (
                                    <span className="mr-2 pr-2 border-r last:border-r-0 last:mr-0 last:pr-0 border-muted-foreground/30 text-sm">
                                        <span className="font-normal text-xs text-muted-foreground">Animals: </span>
                                        {group.animalCount}
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-0 p-0"> {/* Ensure content area doesn't force height */}
                            <ShadcnTable>
                                <ShadcnTableHeader>
                                    <ShadcnTableRow>
                                        <ShadcnTableHead className="w-[40%]">Ingredient Name</ShadcnTableHead>
                                        <ShadcnTableHead className="text-right">Planned Qty</ShadcnTableHead>
                                        <ShadcnTableHead className="w-[180px] text-right">Actual Qty</ShadcnTableHead>
                                        <ShadcnTableHead className="text-right">Difference</ShadcnTableHead>
                                    </ShadcnTableRow>
                                </ShadcnTableHeader>
                                <ShadcnTableBody>
                                    {group.ingredients.map((ing) => {
                                        const actualKey = `${group.groupKey}||${ing.name}||${selectedComparisonColumn!}`;
                                        const actualQtyStr = actualComparisonQuantities[actualKey] || '';
                                        const actualQtyNum = parseFloat(actualQtyStr);
                                        const plannedQtyNum = ing.plannedQty;
                                        let diffStr = '';
                                        let diffStyle: React.CSSProperties = {};

                                        if (actualQtyStr !== '' && !isNaN(actualQtyNum) && !isNaN(plannedQtyNum)) {
                                            const diffNum = actualQtyNum - plannedQtyNum;
                                            diffStr = parseFloat(diffNum.toFixed(4)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4});
                                            if (diffNum < 0) diffStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' };
                                            else if (diffNum > 0) diffStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' };
                                        }

                                        return (
                                            <ShadcnTableRow key={ing.name}>
                                                <ShadcnTableCell>{ing.name}</ShadcnTableCell>
                                                <ShadcnTableCell className="text-right">{ing.plannedQtyDisplay}</ShadcnTableCell>
                                                <ShadcnTableCell className="text-right">
                                                    <Input
                                                        type="number"
                                                        value={actualQtyStr}
                                                        onChange={(e) => handleActualQuantityChange(group.groupKey, ing.name, selectedComparisonColumn!, e.target.value)}
                                                        className="h-8 text-right w-full" // Ensure input is not overly wide
                                                        placeholder="0.00" // Placeholder for actual qty
                                                        step="any"
                                                    />
                                                </ShadcnTableCell>
                                                <ShadcnTableCell className="text-right" style={diffStyle}>{diffStr}</ShadcnTableCell>
                                            </ShadcnTableRow>
                                        );
                                    })}
                                </ShadcnTableBody>
                            </ShadcnTable>
                        </CardContent>
                    </Card>
                ))}
                </div>
              </ScrollArea>
            )}
          </div>
        );
    }


    // "View Data" and "Export Sections" tabs use DataTable
    if (isExportTab) {
      // Logic for splitting data by section for "Export Sections" tab
      const getSectionData = (sectionNameValue: string) => {
          // Filter rawData for this section, then process it with default groupings/summaries
          const rawDataForThisSection = rawData.filter(row => {
            // First, simple string match for section_name
            const sectionMatch = String(row.section_name || '').trim() === sectionNameValue;
            if (!sectionMatch) return false;

            // Then, apply global filters (from SimpleFilterPanel)
            // This requires careful handling as filters expect processed values
             return filters.every(filter => {
                // To correctly apply filters, we'd ideally filter on the raw values
                // or ensure the filter value types match the raw data types.
                // This is a simplified version; robust filtering might need type-aware checks.
                const tempRowArray = [row]; // Process a single row to get its "filterable" value for the column
                // Note: This small, repeated processing could be inefficient for very large datasets.
                // A better approach might be to filter rawData first, then process the subset.
                // However, for UI consistency of what the filter applies to, this might be needed.
                const valueAfterProcessing = calculateProcessedTableData(tempRowArray, [], [], [filter], allHeaders, true, false).filteredData[0]?.[filter.column];
                const filterValue = filter.value;
                const normalizedRowValue = String(valueAfterProcessing ?? '').toLowerCase(); // Use value from temp processing

                if (valueAfterProcessing === undefined || valueAfterProcessing === null || String(valueAfterProcessing).trim() === '') {
                     return filter.type === 'equals' && (filterValue === '' || filterValue === null); // Match empty if filter is for empty
                }
                switch (filter.type) {
                  case 'equals': return normalizedRowValue === String(filterValue).toLowerCase();
                  case 'contains': if (filterValue === '') return true; return normalizedRowValue.includes(String(filterValue).toLowerCase());
                  case 'in': return Array.isArray(filterValue) && filterValue.map(v => String(v).toLowerCase()).includes(normalizedRowValue);
                  case 'range_number':
                    if (Array.isArray(filterValue) && filterValue.length === 2) {
                      const [min, max] = filterValue.map(v => parseFloat(String(v)));
                      const numericRowValue = parseFloat(String(valueAfterProcessing)); // Use value from temp processing
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
          // Process this section's filtered raw data with the *default* groupings and summaries
          return calculateProcessedTableData( rawDataForThisSection, defaultGroupings, defaultSummaries, [], allHeaders, true, false );
      };

      const uniqueSectionNames = [...new Set(filteredData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER))].sort();

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
                  // If sectionTableData.processedData is empty after filtering for this section, show a message or disable download
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
                      <CardContent className="min-h-0 pt-0 p-0"> {/* Adjusted padding */}
                         <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}> {/* Ensures table is scrollable if too tall */}
                          <DataTable
                            data={sectionTableData.processedData}
                            columns={sectionTableData.columns}
                            grandTotalRow={sectionTableData.grandTotalRow}
                            allHeaders={allHeaders} // Pass allHeaders for UoM logic in DataTable
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
    } else { // "View Data" tab
      return (
        <div className="flex-1 min-h-0"> {/* Ensure DataTable can take full height */}
          <DataTable
            data={processedData} // Data processed with default groupings/summaries
            columns={currentTableColumns} // Columns from default processing
            grandTotalRow={grandTotalRow} // Grand total from default processing
            allHeaders={allHeaders} // Pass allHeaders for UoM logic in DataTable
          />
        </div>
      );
    }
  };


  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <DietWiseLogo />
      </header>
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col"> {/* Ensure this container allows flex-grow */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col"> {/* Tabs also flex col */}
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-4">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><FileSpreadsheet className="h-4 w-4"/>Upload Excel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
            <TabsTrigger value="comparison" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent/50 rounded-sm flex items-center justify-center gap-2"><BarChartHorizontalBig className="h-4 w-4"/>Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto"> {/* Basic scroll for upload tab */}
            <div className="container mx-auto flex flex-col items-center justify-center space-y-8 py-10">
              {!isFileSelected && !isLoading && (
                <div className="text-center space-y-4">
                  <Leaf className="mx-auto h-24 w-24 text-primary" />
                  <h1 className="text-4xl font-bold">DietWise</h1>
                  <p className="text-muted-foreground text-lg">
                    Upload your animal diet plan Excel file for analysis and comparison.
                  </p>
                </div>
              )}
              <Card className="w-full max-w-2xl shadow-lg">
                <CardHeader>
                  <CardTitle>Upload Diet Plan</CardTitle>
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
          </TabsContent>

          {/* Data-driven tabs need to be flex containers themselves */}
          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0">
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4"> {/* This div allows filter panel and content to flex */}
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
                    disabled={isLoading || !isFileSelected || isLoadingActualSpeciesFile}
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
    
