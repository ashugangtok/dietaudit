
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2, BarChartHorizontalBig, Save, UploadCloud } from 'lucide-react';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseExcelFlow } from '@/ai/flows/parse-excel-flow';
import { Separator } from '@/components/ui/separator';
import { Table as ShadcnTable, TableBody as ShadcnTableBody, TableCell as ShadcnTableCell, TableHead as ShadcnTableHead, TableHeader as ShadcnTableHeader, TableRow as ShadcnTableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

// Data structures for the Comparison Tab
interface ComparisonPageIngredient {
  ingredientName: string;
  qtyPerSpecies: number;
  qtyForTotalSpecies: number;
  uom: string;
}

interface ComparisonPageType {
  typeName: string;
  ingredients: ComparisonPageIngredient[];
  plannedQtyTypeTotal: number;
}

interface ComparisonPageSpeciesDiet {
  speciesName: string;
  animalCount: number;
  types: ComparisonPageType[];
  totalRowsForSpecies: number; 
}

interface ComparisonPageDietContext {
  dietName: string;
  mealStartTime: string;
  speciesBreakdown: ComparisonPageSpeciesDiet[];
  speciesSummaryText: string; 
  totalRowsInDietContext: number; 
}

interface ComparisonPageGroup {
  groupName: string;
  dietContexts: ComparisonPageDietContext[];
  totalRowsInGroup: number; 
}


const COMPARISON_TAB_INITIAL_GROUPINGS: GroupingOption[] = [
  { column: 'group_name' },
  { column: 'meal_start_time' },
  { column: 'diet_name' },
  { column: 'common_name' }, // Essential for species-specific animal count
  { column: 'type_name' },
  { column: 'ingredient_name' },
];

const COMPARISON_TAB_INITIAL_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'sum' }, // This becomes "Qty/# Species"
  { column: 'total_animal', type: 'first' }, // Animal count for the specific common_name
  { column: 'base_uom_name', type: 'first' },
];


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

  const [comparisonDisplayData, setComparisonDisplayData] = useState<ComparisonPageGroup[]>([]);
  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});

  const [parsedActualSpeciesData, setParsedActualSpeciesData] = useState<DietDataRow[]>([]);
  const [isLoadingActualSpeciesFile, setIsLoadingActualSpeciesFile] = useState<boolean>(false);
  const [actualSpeciesFileName, setActualSpeciesFileName] = useState<string>("species_counts");


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
        setActualQuantities({});
        setParsedActualSpeciesData([]);
        setComparisonDisplayData([]);
    }
  }, [isFileSelected, rawData]);


  useEffect(() => {
    if (activeTab === "comparison" && hasAppliedFilters && rawData.length > 0) {
      setIsLoading(true);
      try {
        const initialProcessed = calculateProcessedTableData(
          rawData,
          COMPARISON_TAB_INITIAL_GROUPINGS,
          COMPARISON_TAB_INITIAL_SUMMARIES,
          filters,
          allHeaders,
          true,
          true 
        );

        const groupsMap = new Map<string, ComparisonPageGroup>();

        initialProcessed.processedData.forEach(row => {
          const groupName = String(row.group_name || 'Unknown Group');
          const mealStartTime = String(row.meal_start_time || 'N/A');
          const dietName = String(row.diet_name || 'Unknown Diet');
          const speciesName = String(row.common_name || 'Unknown Species');
          const typeName = String(row.type_name || 'Unknown Type');
          const ingredientName = String(row.ingredient_name || 'Unknown Ingredient');
          
          const animalCountFromRow = parseInt(String(row.total_animal_first), 10);
          const animalCount = isNaN(animalCountFromRow) || animalCountFromRow < 0 ? 0 : animalCountFromRow;
          
          const qtyPerSpecies = parseFloat(String(row.ingredient_qty_sum)) || 0; 
          const uom = String(row.base_uom_name_first || '');

          if (!groupsMap.has(groupName)) {
            groupsMap.set(groupName, { groupName, dietContexts: [], totalRowsInGroup: 0 });
          }
          const currentGroup = groupsMap.get(groupName)!;

          const dietContextKey = `${dietName}|${mealStartTime}`;
          let currentDietContext = currentGroup.dietContexts.find(dc => dc.dietName === dietName && dc.mealStartTime === mealStartTime);
          if (!currentDietContext) {
            currentDietContext = { dietName, mealStartTime, speciesBreakdown: [], speciesSummaryText: '', totalRowsInDietContext: 0 };
            currentGroup.dietContexts.push(currentDietContext);
          }

          let currentSpeciesDiet = currentDietContext.speciesBreakdown.find(sd => sd.speciesName === speciesName);
          if (!currentSpeciesDiet) {
            currentSpeciesDiet = { speciesName, animalCount, types: [], totalRowsForSpecies: 0 };
            currentDietContext.speciesBreakdown.push(currentSpeciesDiet);
          } else {
             // If animalCount was 0 and now we have a valid one, update it.
             // Or, if different valid counts are found for the same species in the same diet context,
             // take the max (this scenario should ideally be cleaned in data or by stricter grouping).
             if (animalCount > 0 && currentSpeciesDiet.animalCount <= 0) {
                 currentSpeciesDiet.animalCount = animalCount;
             } else if (animalCount > 0 && animalCount !== currentSpeciesDiet.animalCount) {
                 // This case implies data might have varying animal counts for the same species within the same diet.
                 // Taking max, but ideally this is consistent in source data for a given diet context + species.
                 currentSpeciesDiet.animalCount = Math.max(currentSpeciesDiet.animalCount, animalCount);
             }
          }
          
          let currentType = currentSpeciesDiet.types.find(t => t.typeName === typeName);
          if (!currentType) {
            currentType = { typeName, ingredients: [], plannedQtyTypeTotal: 0 };
            currentSpeciesDiet.types.push(currentType);
          }

          // qtyForTotalSpecies uses the animalCount specific to *this* speciesDiet
          const qtyForTotalSpecies = parseFloat((qtyPerSpecies * currentSpeciesDiet.animalCount).toFixed(4));
          currentType.ingredients.push({
            ingredientName,
            qtyPerSpecies: parseFloat(qtyPerSpecies.toFixed(4)),
            qtyForTotalSpecies,
            uom,
          });
        });

        // Calculate totalRows for rowSpans and speciesSummaryText
        groupsMap.forEach(group => {
          group.totalRowsInGroup = 0;
          group.dietContexts.forEach(dietContext => {
            dietContext.totalRowsInDietContext = 0;
            const distinctSpeciesMap = new Map<string, number>();

            dietContext.speciesBreakdown.forEach(speciesDiet => {
              speciesDiet.totalRowsForSpecies = 0; 
              if (speciesDiet.animalCount > 0) { // Only count species with animals for summary
                distinctSpeciesMap.set(speciesDiet.speciesName, speciesDiet.animalCount);
              }
              
              speciesDiet.types.sort((a, b) => a.typeName.localeCompare(b.typeName));
              speciesDiet.types.forEach(type => {
                type.ingredients.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
                type.plannedQtyTypeTotal = parseFloat(type.ingredients.reduce((sum, ing) => sum + ing.qtyForTotalSpecies, 0).toFixed(4));
                speciesDiet.totalRowsForSpecies += type.ingredients.length + 1; // +1 for the type subtotal row
              });
              dietContext.totalRowsInDietContext += speciesDiet.totalRowsForSpecies;
            });
            group.totalRowsInGroup += dietContext.totalRowsInDietContext;

            const speciesEntries = Array.from(distinctSpeciesMap.entries());
            if (speciesEntries.length > 0) {
              dietContext.speciesSummaryText = `${speciesEntries.length} Species: ${speciesEntries.map(([name, count]) => `${name} (${count})`).join(', ')}`;
            } else {
              dietContext.speciesSummaryText = "No species with animal counts";
            }
            dietContext.speciesBreakdown.sort((a,b) => a.speciesName.localeCompare(b.speciesName));
          });
          group.dietContexts.sort((a,b) => {
            const dietComp = a.dietName.localeCompare(b.dietName);
            if (dietComp !== 0) return dietComp;
            return a.mealStartTime.localeCompare(b.mealStartTime);
          });
        });

        const finalDisplayData = Array.from(groupsMap.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
        setComparisonDisplayData(finalDisplayData);

      } catch (e) {
        console.error("Error processing comparison data:", e);
        toast({ variant: "destructive", title: "Comparison Data Error", description: "Could not structure data for comparison." });
        setComparisonDisplayData([]);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === "comparison" && (!hasAppliedFilters || rawData.length === 0)) {
        setComparisonDisplayData([]);
        setIsLoading(false);
    }
  }, [activeTab, hasAppliedFilters, rawData, filters, allHeaders, toast]);


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
    setActualQuantities({});
    setParsedActualSpeciesData([]);
    setComparisonDisplayData([]);

    toast({
        title: "File Ready for Processing",
        description: `"${cleanFileName}" selected. Apply filters on other tabs to view data.`,
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
                description: `"${fileName}" processed with ${result.parsedData.length} rows. (Note: This data is not yet used in the comparison table's current logic).`,
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
    setActualQuantities({});

    try {
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            setComparisonDisplayData([]);
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

        const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => result.headers.includes(col as string));

        if (canApplyDefaultImagePivot) {
            setDefaultGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
            // Ensure base_uom_name is part of summaries for View Data tab if present
            const currentViewSummaries = [...DEFAULT_IMAGE_PIVOT_SUMMARIES];
            if (result.headers.includes('base_uom_name') && !currentViewSummaries.find(s => s.column === 'base_uom_name')) {
                currentViewSummaries.push({ column: 'base_uom_name', type: 'first'});
            }
            setDefaultSummaries(currentViewSummaries);
        } else {
            // Fallback logic remains, might need adjustment based on typical user files
            const fallbackGroupingCandidates = ['group_name', 'common_name', 'diet_name', 'type_name', 'ingredient_name'];
            const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => result.headers.includes(h as string));
            setDefaultGroupings(availableFallbackGroupings.length > 0
                ? availableFallbackGroupings.slice(0,4).map(col => ({ column: col as string }))
                : result.headers.length > 0 ? [{ column: result.headers[0] }] : []);

            const fallbackSummaries: SummarizationOption[] = [];
            if (result.headers.includes('ingredient_qty')) fallbackSummaries.push({ column: 'ingredient_qty', type: 'sum' });
            if (result.headers.includes('base_uom_name')) fallbackSummaries.push({ column: 'base_uom_name', type: 'first'});
            if (result.headers.includes('total_animal')) fallbackSummaries.push({ column: 'total_animal', type: 'first'});

            if (fallbackSummaries.length === 0 && result.parsedData.length > 0 && result.headers.length > 0) {
                const firstDataRow = result.parsedData[0];
                const someNumericHeader = result.headers.find(h => typeof firstDataRow[h] === 'number' && h !== 'total_animal' && h !== 'ingredient_qty'); // Avoid re-adding
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
                description: `"${rawFileName}" processed. View data or switch to Comparison tab.`,
            });
        }

    } catch (error) {
        console.error("Error during 'Apply Filters' (including parsing):", error);
        toast({ variant: "destructive", title: "Processing Error", description: "An unexpected error occurred while parsing or filtering the file." });
        setRawData([]);
        setAllHeaders([]);
        setComparisonDisplayData([]);
    } finally {
        setIsLoading(false);
    }
  }, [isFileSelected, rawFileBase64, rawFileName, toast]);


  const buildActualQtyKey = (groupName: string, dietName: string, mealStartTime: string, speciesName: string, typeName: string, ingredientName?: string) => {
    let key = `${groupName}|${dietName}|${mealStartTime}|${speciesName}|${typeName}`;
    if (ingredientName) {
      key += `|${ingredientName}`;
    } else {
      key += `|__TYPE_SUBTOTAL__`; // Special marker for type subtotal input
    }
    return key;
  };


  const handleActualQuantityChange = useCallback((actualKey: string, value: string) => {
    setActualQuantities(prev => ({ ...prev, [actualKey]: value }));
  }, []);


  const handleDownloadAllPdf = () => {
    if (activeTab === "comparison") {
        if (!hasAppliedFilters || comparisonDisplayData.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "No data available for comparison. Apply filters and process data first." });
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        let firstPageOverall = true;

        comparisonDisplayData.forEach((group) => {
            if (!firstPageOverall) doc.addPage(); else firstPageOverall = false;
            doc.setFontSize(14);
            doc.text(`Group: ${group.groupName}`, 40, 30);
            let currentY = 50;

            group.dietContexts.forEach((dietContext, dietCtxIdx) => {
                if (dietCtxIdx > 0 && currentY > 50) currentY += 15; // Space between diet contexts

                if (currentY > doc.internal.pageSize.height - 150 && group.dietContexts.length > 1) { // Check for page break before new diet context
                    doc.addPage(); currentY = 40;
                    doc.setFontSize(14); doc.text(`Group: ${group.groupName} (Continued)`, 40, 30); currentY += 20;
                }

                doc.setFontSize(11);
                doc.text(`Diet: ${dietContext.dietName} / Meal: ${dietContext.mealStartTime}`, 40, currentY); currentY += 15;
                doc.text(`Species Context: ${dietContext.speciesSummaryText}`, 40, currentY); currentY += 20;


                dietContext.speciesBreakdown.forEach((speciesDiet, speciesIdx) => {
                    if (speciesIdx > 0 && currentY > 70) currentY += 10; // Space between species
                     if (currentY > doc.internal.pageSize.height - 120 && dietContext.speciesBreakdown.length > 1) { // Check page break before new species
                        doc.addPage(); currentY = 40;
                        doc.setFontSize(14); doc.text(`Group: ${group.groupName} (Continued)`, 40, 30); currentY += 20;
                        doc.setFontSize(11); doc.text(`Diet: ${dietContext.dietName} / Meal: ${dietContext.mealStartTime} (Cont.)`, 40, currentY); currentY+=15;
                        doc.text(`Species Context: ${dietContext.speciesSummaryText} (Cont.)`, 40, currentY); currentY += 20;
                    }

                    doc.setFontSize(10);
                    doc.text(`Species: ${speciesDiet.speciesName} (Count: ${speciesDiet.animalCount})`, 50, currentY); currentY += 15;

                    speciesDiet.types.forEach((type, typeIdx) => {
                        if (typeIdx > 0 && currentY > 85) currentY += 10; // Space between types
                        if (currentY > doc.internal.pageSize.height - 100) { // Check page break before new type table
                           doc.addPage(); currentY = 40;
                           doc.setFontSize(14); doc.text(`Group: ${group.groupName} (Continued)`, 40, 30); currentY += 20;
                           doc.setFontSize(11); doc.text(`Diet: ${dietContext.dietName} / Meal: ${dietContext.mealStartTime} (Cont.)`, 40, currentY); currentY+=15;
                           doc.text(`Species Context: ${dietContext.speciesSummaryText} (Cont.)`, 40, currentY); currentY +=15;
                           doc.setFontSize(10); doc.text(`Species: ${speciesDiet.speciesName} (Count: ${speciesDiet.animalCount}) (Cont.)`, 50, currentY); currentY += 15;
                        }

                        const head = [['Type Name', 'Ingredient Name', 'Qty/# Species', 'Qty/Total Species', 'Qty to Receive', 'Qty Received', 'Difference']];
                        const body = [];

                        // Add ingredient rows
                        type.ingredients.forEach(ing => {
                            const actualIngKey = buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName, ing.ingredientName);
                            const actualQtyStr = actualQuantities[actualIngKey] || '';
                            const actualQtyNum = parseFloat(actualQtyStr);
                            let diffStr = '';
                            if (actualQtyStr !== '' && !isNaN(actualQtyNum)) {
                                diffStr = (actualQtyNum - ing.qtyForTotalSpecies).toFixed(4);
                            }
                            body.push([
                                ing === type.ingredients[0] ? type.typeName : '', // Show type name only for first ingredient of the type
                                ing.ingredientName,
                                ing.qtyPerSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''),
                                ing.qtyForTotalSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''),
                                ing.qtyForTotalSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''), // Qty to be received is same as Qty for total species
                                actualQtyStr,
                                diffStr
                            ]);
                        });
                        
                        // Add type subtotal row
                        const actualTypeKey = buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName);
                        const actualTypeQtyStr = actualQuantities[actualTypeKey] || '';
                        const actualTypeQtyNum = parseFloat(actualTypeQtyStr);
                        let diffTypeStr = '';
                        if (actualTypeQtyStr !== '' && !isNaN(actualTypeQtyNum)) {
                            diffTypeStr = (actualTypeQtyNum - type.plannedQtyTypeTotal).toFixed(4);
                        }
                        body.push([
                            { content: type.typeName, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }, // Type name in first col for subtotal
                            { content: 'SUBTOTAL', styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230] } },
                            { content: '', styles: {fillColor: [230,230,230]}}, // Empty for Qty/# Species
                            { content: '', styles: {fillColor: [230,230,230]}}, // Empty for Qty/Total Species
                            { content: type.plannedQtyTypeTotal.toFixed(4) + (type.ingredients[0]?.uom ? ` ${type.ingredients[0].uom}` : ''), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } },
                            { content: actualTypeQtyStr, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } },
                            { content: diffTypeStr, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } }
                        ]);

                        autoTable(doc, {
                            head: head, body: body, startY: currentY, theme: 'grid',
                            headStyles: { fillColor: [38, 153, 153], textColor: [255,255,255], fontSize: 7, cellPadding: 2}, // hsl(var(--primary))
                            styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize'},
                            columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 90 }, 2: { cellWidth: 55, halign: 'right' }, 3: { cellWidth: 60, halign: 'right' }, 4: { cellWidth: 65, halign: 'right' }, 5: { cellWidth: 55, halign: 'right' }, 6: { cellWidth: 55, halign: 'right' } },
                            didParseCell: (data) => {
                                // Color difference column
                                if (data.column.index === 6) { // "Difference" column
                                     const cellRawValue = data.cell.raw;
                                     if (cellRawValue !== null && cellRawValue !== undefined && String(cellRawValue).trim() !== '') {
                                        const numericValue = parseFloat(String(cellRawValue));
                                        if (!isNaN(numericValue)) {
                                            if (numericValue < 0) data.cell.styles.textColor = [220, 53, 69]; // Destructive color (red-ish)
                                            else if (numericValue > 0) data.cell.styles.textColor = [0, 123, 255]; // A blue color
                                        }
                                    }
                                }
                            },
                            didDrawPage: (dataHook) => { // Page numbers
                                 doc.setFontSize(8);
                                 doc.text("Page " + doc.internal.getNumberOfPages(), doc.internal.pageSize.width - 60, doc.internal.pageSize.height - 20);
                            },
                        });
                        currentY = (doc as any).lastAutoTable.finalY + 10;
                    });
                });
            });
        });
        doc.save(`${rawFileName}_comparison_report.pdf`);
        toast({ title: "PDF Download Started", description: `Your Comparison report PDF is being generated.` });
        return;
    }


    // Logic for "View Data" and "Export Sections" PDF (remains largely the same)
    let dataToExport: DietDataRow[] = [];
    let columnsToExport: string[] = [];
    let grandTotalToExport: DietDataRow | undefined = undefined;

    if (activeTab === "extractedData" || activeTab === "exportSections") {
        dataToExport = processedData.map(row => ({...row}));
        columnsToExport = [...currentTableColumns];
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined;


        const ingredientQtySumKey = columnsToExport.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
        const uomKey = columnsToExport.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));

        if (ingredientQtySumKey && uomKey && allHeaders.includes('base_uom_name')) {
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
             if (uomKey !== ingredientQtySumKey) { // Remove the separate UOM column if concatenated
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

     // Deep copy to avoid modifying the state directly
     const sectionTableData = {
         processedData: sectionTableDataInput.processedData.map(row => ({...row})),
         columns: [...sectionTableDataInput.columns],
         grandTotalRow: sectionTableDataInput.grandTotalRow ? {...sectionTableDataInput.grandTotalRow} : undefined
     };


     // UoM concatenation logic for section PDF
     const ingredientQtySumKey = sectionTableData.columns.find(k => k.startsWith('ingredient_qty_') && k.endsWith('_sum'));
     const uomKey = sectionTableData.columns.find(k => k.startsWith('base_uom_name_') && k.endsWith('_first'));

     if (ingredientQtySumKey && uomKey && allHeaders.includes('base_uom_name')) { // Check if original UoM header exists
        sectionTableData.processedData = sectionTableData.processedData.map(row => {
            const newRow = {...row};
            const qty = newRow[ingredientQtySumKey];
            const uom = newRow[uomKey]; // This is the 'base_uom_name_first' value for this row
            if (typeof qty === 'number' && typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                newRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
            return newRow;
        });
        if (sectionTableData.grandTotalRow && typeof sectionTableData.grandTotalRow[ingredientQtySumKey] === 'number') {
            const qty = sectionTableData.grandTotalRow[ingredientQtySumKey] as number;
            const uom = sectionTableData.grandTotalRow[uomKey]; // UoM from grand total row
             if (typeof uom === 'string' && uom.trim() !== '' && uom !== PIVOT_BLANK_MARKER) {
                 sectionTableData.grandTotalRow[ingredientQtySumKey] = `${qty.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})} ${uom.trim()}`;
            }
        }
        // Remove the separate UoM column if concatenation happened and it's not the same as the qty column
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

  const handlePrepareSaveData = () => {
    if (comparisonDisplayData.length === 0) {
        toast({ variant: "destructive", title: "No Data to Prepare", description: "No comparison data processed." });
        return;
    }

    const dataToSave: any[] = [];
    comparisonDisplayData.forEach(group => {
      group.dietContexts.forEach(dietContext => {
        dietContext.speciesBreakdown.forEach(speciesDiet => {
          const recordToSave: any = {
            group_name: group.groupName,
            meal_start_time: dietContext.mealStartTime,
            diet_name: dietContext.dietName, // Original diet name
            species_name: speciesDiet.speciesName,
            animal_count: speciesDiet.animalCount,
            types: []
          };

          speciesDiet.types.forEach(type => {
            const typeRecord: any = {
              type_name: type.typeName,
              planned_total_qty_for_type: type.plannedQtyTypeTotal, // Sum of planned ingredients for this type
              actual_total_qty_for_type: parseFloat(actualQuantities[buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName)] || 'NaN') || null,
              ingredients: []
            };
            type.ingredients.forEach(ing => {
              const actualIngKey = buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName, ing.ingredientName);
              const actualIngQtyStr = actualQuantities[actualIngKey] || '';
              typeRecord.ingredients.push({
                ingredient_name: ing.ingredientName,
                qty_per_species: ing.qtyPerSpecies,
                uom: ing.uom,
                planned_qty_for_total_species: ing.qtyForTotalSpecies,
                actual_qty_received: actualIngQtyStr !== '' ? (parseFloat(actualIngQtyStr) || null) : null,
              });
            });
            recordToSave.types.push(typeRecord);
          });
          dataToSave.push(recordToSave);
        });
      });
    });


    const jsonData = JSON.stringify(dataToSave, null, 2);
    // For now, log to console. In a real app, this would be sent to a backend.
    console.log("Data prepared for saving (JSON):", jsonData);
    toast({
        title: "Data Prepared for Backend",
        description: "Check the browser console for the JSON data. Implement backend logic to save this.",
        duration: 10000, // Longer duration for users to check console
    });
  };

  const year = new Date().getFullYear();

  const renderContentForDataTabs = (isExportTab: boolean, isComparisonTab: boolean = false) => {
    if (isLoading && !isComparisonTab) {
      return (
        <Card><CardHeader><CardTitle>Processing...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
      );
    }
     if (isComparisonTab && isLoading) { // Specific loading state for comparison tab's structuring phase
      return (
        <Card><CardHeader><CardTitle>Structuring Comparison Data...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
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
                    onProcessing={setIsLoading} // This controls the main isLoading flag
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


    // Specific handling for "View Data" and "Export Sections" data visibility
    if (!isComparisonTab) {
        if (rawData.length === 0 && allHeaders.length > 0 && hasAppliedFilters) { // Only headers in file
            return <Card><CardContent className="p-6 text-center text-muted-foreground">File "<strong>{rawFileName}</strong>" contains only headers.</CardContent></Card>;
        }
        if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) { // No data or headers extracted
            return <Card><CardContent className="p-6 text-center text-destructive">No data or headers extracted from "<strong>{rawFileName}</strong>".</CardContent></Card>;
        }
        // This condition checks if, after filtering, the *processedData* (which is grouped/summarized) is empty,
        // even if the *rawData* (after initial parse) had content.
        if (processedData.length === 0 && rawData.length > 0 && hasAppliedFilters ) {
           return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the current view.</CardContent></Card>;
        }
    }



    if (isComparisonTab) {
        if (isLoadingActualSpeciesFile) {
            return <Card><CardHeader><CardTitle>Loading Species File...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>;
        }
        if (comparisonDisplayData.length === 0 && rawData.length > 0 && hasAppliedFilters) {
            // This message appears if the transformation to comparisonDisplayData yields nothing.
            return (
              <Card className="flex-1">
                <CardHeader>
                    <CardTitle>Comparison - No Data Matches Filters or Structure</CardTitle>
                    <CardDescription>Adjust filters or check data. Ensure group, diet, common_name, type, and ingredient columns are present and data exists for the current filter selection.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 text-center text-muted-foreground">
                    <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto mb-4" />
                    <p>No data could be structured for the comparison. This might be due to filters, or missing/mismatched context columns in your Excel file.</p>
                </CardContent>
              </Card>
            );
        }

        const renderComparisonRows = () => {
            const rows: JSX.Element[] = [];
            comparisonDisplayData.forEach((group) => {
                let isFirstRowOfGroup = true;
                group.dietContexts.forEach((dietContext) => {
                    let isFirstRowOfDietContext = true;
                    dietContext.speciesBreakdown.forEach((speciesDiet) => {
                        let isFirstRowOfSpecies = true;
                        speciesDiet.types.forEach((type) => {
                            const typeActualKey = buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName);
                            const typeActualQtyStr = actualQuantities[typeActualKey] || '';
                            const typeActualQtyNum = parseFloat(typeActualQtyStr);
                            let typeDiff = NaN;
                            if (!isNaN(typeActualQtyNum)) {
                                typeDiff = typeActualQtyNum - type.plannedQtyTypeTotal;
                            }

                            // Type Subtotal Row
                            rows.push(
                                <ShadcnTableRow key={`${typeActualKey}_subtotal`} className="bg-muted/50 dark:bg-muted/30 font-semibold hover:bg-muted">
                                    {isFirstRowOfGroup && <ShadcnTableCell rowSpan={group.totalRowsInGroup} className="border align-top pt-2">{group.groupName}</ShadcnTableCell>}
                                    {isFirstRowOfDietContext && <ShadcnTableCell rowSpan={dietContext.totalRowsInDietContext} className="border align-top pt-2">{dietContext.mealStartTime}</ShadcnTableCell>}
                                    {isFirstRowOfDietContext && <ShadcnTableCell rowSpan={dietContext.totalRowsInDietContext} className="border align-top pt-2">{dietContext.dietName}</ShadcnTableCell>}
                                    {isFirstRowOfDietContext && <ShadcnTableCell rowSpan={dietContext.totalRowsInDietContext} className="border align-top pt-2 whitespace-pre-line">{dietContext.speciesSummaryText}</ShadcnTableCell>}
                                    {isFirstRowOfSpecies && <ShadcnTableCell rowSpan={speciesDiet.totalRowsForSpecies} className="border align-top pt-2">{`${speciesDiet.speciesName} (${speciesDiet.animalCount})`}</ShadcnTableCell>}
                                    
                                    <ShadcnTableCell className="border text-left italic">{type.typeName}</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right italic">SUBTOTAL (Mix)</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right"></ShadcnTableCell>{/* Qty/# Species - Empty for subtotal */}
                                    <ShadcnTableCell className="border text-right"></ShadcnTableCell>{/* Qty/total Animals - Empty for subtotal */}
                                    <ShadcnTableCell className="border text-right">{type.plannedQtyTypeTotal.toFixed(4)}</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right">
                                        <Input
                                            type="number" step="any"
                                            value={typeActualQtyStr}
                                            onChange={(e) => handleActualQuantityChange(typeActualKey, e.target.value)}
                                            className="h-8 text-right w-full min-w-[80px]"
                                            aria-label={`Actual quantity for type ${type.typeName}`}
                                        />
                                    </ShadcnTableCell>
                                    <ShadcnTableCell className={`border text-right ${typeDiff < 0 ? 'text-red-600 dark:text-red-400' : typeDiff > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                        {!isNaN(typeDiff) ? typeDiff.toFixed(4) : ''}
                                    </ShadcnTableCell>
                                </ShadcnTableRow>
                            );
                            
                            isFirstRowOfGroup = false; // Will be false for all subsequent rows in this group
                            isFirstRowOfDietContext = false; // False for subsequent species/types in this diet context
                            
                            // Ingredient Rows for this Type
                            type.ingredients.forEach((ing) => {
                                const ingActualKey = buildActualQtyKey(group.groupName, dietContext.dietName, dietContext.mealStartTime, speciesDiet.speciesName, type.typeName, ing.ingredientName);
                                const ingActualQtyStr = actualQuantities[ingActualKey] || '';
                                const ingActualQtyNum = parseFloat(ingActualQtyStr);
                                let ingDiff = NaN;
                                if (!isNaN(ingActualQtyNum)) {
                                    ingDiff = ingActualQtyNum - ing.qtyForTotalSpecies;
                                }
                                rows.push(
                                    <ShadcnTableRow key={ingActualKey} className="hover:bg-accent/10">
                                        {/* Rowspan cells are only rendered if isFirstRowOf... is true. Otherwise, they are skipped by this logic. */}
                                        {/* No explicit nulls needed here as the logic for rowspan handles this. */}
                                        
                                        <ShadcnTableCell className="border text-left pl-4">{type.typeName === "Unknown Type" ? "" : type.typeName}</ShadcnTableCell>
                                        <ShadcnTableCell className="border text-left">{ing.ingredientName}</ShadcnTableCell>
                                        <ShadcnTableCell className="border text-right">{ing.qtyPerSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell>
                                        <ShadcnTableCell className="border text-right">{ing.qtyForTotalSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell>
                                        <ShadcnTableCell className="border text-right">{ing.qtyForTotalSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell>
                                        <ShadcnTableCell className="border text-right">
                                            <Input
                                                type="number" step="any"
                                                value={ingActualQtyStr}
                                                onChange={(e) => handleActualQuantityChange(ingActualKey, e.target.value)}
                                                className="h-8 text-right w-full min-w-[80px]"
                                                aria-label={`Actual quantity for ingredient ${ing.ingredientName}`}
                                            />
                                        </ShadcnTableCell>
                                        <ShadcnTableCell className={`border text-right ${ingDiff < 0 ? 'text-red-600 dark:text-red-400' : ingDiff > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                            {!isNaN(ingDiff) ? ingDiff.toFixed(4) : ''}
                                        </ShadcnTableCell>
                                    </ShadcnTableRow>
                                );
                            });
                             isFirstRowOfSpecies = false; // False for subsequent types in this species diet
                        });
                    });
                });
            });
            return rows;
        };

        return (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-2">
                    {/* Placeholder for potential future controls specific to comparison */}
                </div>
                <div className="flex flex-col items-end space-y-2">
                     <FileUpload
                        onFileSelected={handleActualSpeciesFileSelectedCallback}
                        onProcessing={setIsLoadingActualSpeciesFile} // Separate loading state for this specific upload
                        disabled={isLoadingActualSpeciesFile || !hasAppliedFilters} // Disable if processing this file or if main data not filtered
                    />
                    {parsedActualSpeciesData.length > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400">"{actualSpeciesFileName}" loaded ({parsedActualSpeciesData.length} rows).</p>
                    )}
                </div>
                <div className="flex flex-col items-end space-y-2">
                    <Button onClick={handlePrepareSaveData} size="sm" variant="outline" disabled={isLoading || comparisonDisplayData.length === 0 || !hasAppliedFilters}>
                        <Save className="mr-2 h-4 w-4" /> Prepare Save Data
                    </Button>
                    <Button onClick={handleDownloadAllPdf} size="sm" disabled={isLoading || comparisonDisplayData.length === 0 || !hasAppliedFilters}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download PDF
                    </Button>
                </div>
            </div>
            <Separator />

            <ScrollArea className="flex-1 -mx-4 px-4"> {/* Added negative margin and padding to allow full-width scroll content */}
                <ShadcnTable className="min-w-full border-collapse border border-muted">
                    <ShadcnTableHeader className="sticky top-0 bg-card z-10">
                        <ShadcnTableRow>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[120px] text-left">group_name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[80px] text-left">Start Time</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[200px] text-left">diet_name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[250px] text-left">Species Context</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[180px] text-left">Species & Animal Count</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[150px] text-left">type_name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[150px] text-left">ingredient_name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Qty/# Species</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Qty/total Animals</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Qty to be Received</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Qty Received</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Difference</ShadcnTableHead>
                        </ShadcnTableRow>
                    </ShadcnTableHeader>
                    <ShadcnTableBody>
                        {comparisonDisplayData.length > 0 ? renderComparisonRows() : (
                            <ShadcnTableRow>
                                <ShadcnTableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                                    No comparison data to display. Apply filters to process your Excel file.
                                </ShadcnTableCell>
                            </ShadcnTableRow>
                        )}
                    </ShadcnTableBody>
                </ShadcnTable>
            </ScrollArea>
          </div>
        );
    }



    // For "View Data" and "Export Sections" tabs
    if (isExportTab) {
      // Logic for splitting data by 'section_name' for export sections tab
      const getSectionData = (sectionNameValue: string) => {
          // Filter rawData by section_name *and* current global filters
          // This requires careful application of filters, similar to main processing.

          const rawDataForThisSection = rawData.filter(row => {
            // Match section_name
            const sectionMatch = String(row.section_name || '').trim() === sectionNameValue;
            if (!sectionMatch) return false;

            // Apply global filters (filters state)
             return filters.every(filter => {
                // This re-uses the filtering logic from calculateProcessedTableData (conceptually)
                // For simplicity, we assume calculateProcessedTableData's filter logic is sufficient
                // and we're applying it here manually. A more robust way might involve
                // passing the raw data through calculateProcessedTableData with only the filter part.
                const valueAfterProcessing = calculateProcessedTableData([row], [], [], [filter], allHeaders, true, false).filteredData[0]?.[filter.column];
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

          // Now process this section-specific, globally-filtered data with default groupings/summaries
          return calculateProcessedTableData( rawDataForThisSection, defaultGroupings, defaultSummaries, [], allHeaders, true, false );
      };

      const uniqueSectionNames = [...new Set(processedData.map(row => String(row.section_name || PIVOT_BLANK_MARKER).trim()).filter(name => name && name !== PIVOT_BLANK_MARKER && name !== "Grand Total"))].sort();

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
                      // If a section exists but filtering makes its data empty for display
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
                      <CardContent className="min-h-0 pt-0 p-0"> {/* Ensure content area doesn't force height */}
                         <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}> {/* Scrollable div for table */}
                          <DataTable
                            data={sectionTableData.processedData}
                            columns={sectionTableData.columns}
                            grandTotalRow={sectionTableData.grandTotalRow}
                            allHeaders={allHeaders} // Pass allHeaders for UoM logic
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
        <div className="flex-1 min-h-0"> {/* Ensure this container allows DataTable to manage its own scroll/height */}
          <DataTable
            data={processedData}
            columns={currentTableColumns}
            grandTotalRow={grandTotalRow}
            allHeaders={allHeaders} // Pass allHeaders for UoM logic
          />
        </div>
      );
    }
  };


  return (
    <main className="min-h-screen text-foreground flex flex-col bg-transparent">
      <header className="px-4 py-3 border-b flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <DietWiseLogo />
        {/* Potentially add global actions or user info here later */}
      </header>
      <div className="px-4 py-2 border-b flex-1 min-h-0 flex flex-col"> {/* Ensure this flex container allows tabs content to grow */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
          <TabsList className="bg-muted p-1 rounded-md grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="uploadExcel" className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><UploadCloud className="h-4 w-4"/>Upcel</TabsTrigger>
            <TabsTrigger value="extractedData" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><TableIcon className="h-4 w-4" />View Data</TabsTrigger>
            <TabsTrigger value="exportSections" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><ListChecks className="h-4 w-4"/>Export by Section</TabsTrigger>
            <TabsTrigger value="comparison" disabled={!isFileSelected && !isLoading} className="px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:text-muted-foreground rounded-sm flex items-center justify-center gap-2"><BarChartHorizontalBig className="h-4 w-4"/>Comparison</TabsTrigger>
          </TabsList>

          {/* Tab Content Areas */}
          <TabsContent value="uploadExcel" className="mt-2 flex-1 overflow-y-auto flex items-center justify-center"> {/* Centering for upload */}
             {renderContentForDataTabs(false, false)}
          </TabsContent>


          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0"> {/* Allow content to take full height and scroll internally */}
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4"> {/* Added pt-4 for spacing */}
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
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4"> {/* Added pt-4 for spacing */}
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
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4"> {/* Added pt-4 for spacing */}
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

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-auto bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto">
          DietWise &copy; {year}
        </div>
      </footer>
    </main>
  );
}
    
