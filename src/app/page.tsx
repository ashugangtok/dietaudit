
"use client";

import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Leaf, FileSpreadsheet, AlertCircle, ListChecks, TableIcon, Download, Loader2, BarChartHorizontalBig, Save } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Table as ShadcnTable, TableBody as ShadcnTableBody, TableCell as ShadcnTableCell, TableHead as ShadcnTableHead, TableHeader as ShadcnTableHeader, TableRow as ShadcnTableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

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

interface ComparisonPageDiet {
  dietKey: string; // Composite key: group_name|diet_name_raw|common_name|meal_start_time
  dietNameRaw: string;
  commonName: string; // Species Name
  mealStartTime: string;
  dietNameDisplay: string; // e.g. "Diet Name - Species Name (Animal Count) - Meal: Start Time"
  animalCount: number;
  types: ComparisonPageType[];
}

interface ComparisonPageGroup {
  groupName: string; // Corresponds to the 'group_name' field from Excel
  diets: ComparisonPageDiet[];
  totalRowsInGroup: number; // For PDF rowspan calculation assistance if needed
}

// Groupings to get the necessary detail for comparison tab structure
const COMPARISON_TAB_INITIAL_GROUPINGS: GroupingOption[] = [
  { column: 'group_name' },
  { column: 'diet_name' },
  { column: 'common_name' }, // Ensure common_name is a primary grouping
  { column: 'meal_start_time' },
  { column: 'type_name' },
  { column: 'ingredient_name' },
];

// Summaries to get correct quantities for comparison
const COMPARISON_TAB_INITIAL_SUMMARIES: SummarizationOption[] = [
  { column: 'ingredient_qty', type: 'sum' }, // This will be qty per ingredient for the group context
  { column: 'total_animal', type: 'first' },   // Animal count for the common_name
  { column: 'base_uom_name', type: 'first' },// UOM for the ingredient
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

  // This useTableProcessor is for "View Data" and "Export Sections" tabs
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
          filters, // Apply user's current filters
          allHeaders,
          true, // hasAppliedFilters is true here
          true  // disableDisplayBlanking to get raw context values
        );

        const groupsMap = new Map<string, ComparisonPageGroup>();

        initialProcessed.processedData.forEach(row => {
          const groupName = String(row.group_name || 'Unknown Group');
          const dietNameRaw = String(row.diet_name || 'Unknown Diet');
          const commonName = String(row.common_name || 'Unknown Species'); // Species Name
          const mealStartTime = String(row.meal_start_time || 'N/A');
          const typeName = String(row.type_name || 'Unknown Type');
          const ingredientName = String(row.ingredient_name || 'Unknown Ingredient');

          // Use the summarized 'total_animal_first' for animal count for this species
          const animalCount = parseInt(String(row.total_animal_first), 10) || 0;
          const qtyPerSpecies = parseFloat(String(row.ingredient_qty_sum)) || 0;
          const uom = String(row.base_uom_name_first || '');

          if (!groupsMap.has(groupName)) {
            groupsMap.set(groupName, { groupName, diets: [], totalRowsInGroup: 0 });
          }
          const currentGroup = groupsMap.get(groupName)!;

          // Diet key now includes common_name to differentiate diets for different species within the same group/meal
          const dietKey = `${groupName}|${dietNameRaw}|${commonName}|${mealStartTime}`;

          let currentDiet = currentGroup.diets.find(d => d.dietKey === dietKey);
          if (!currentDiet) {
            currentDiet = {
              dietKey,
              dietNameRaw,
              commonName, // Store common_name
              mealStartTime,
              dietNameDisplay: `${dietNameRaw} - ${commonName} (${animalCount}) - Meal: ${mealStartTime}`,
              animalCount,
              types: []
            };
            currentGroup.diets.push(currentDiet);
          } else {
            // Update animal count if a row for this dietKey has a more accurate one (though 'first' should be consistent)
            if(animalCount > 0 && currentDiet.animalCount === 0) {
                currentDiet.animalCount = animalCount;
                currentDiet.dietNameDisplay = `${dietNameRaw} - ${commonName} (${animalCount}) - Meal: ${mealStartTime}`;
            }
          }


          let currentType = currentDiet.types.find(t => t.typeName === typeName);
          if (!currentType) {
            currentType = { typeName, ingredients: [], plannedQtyTypeTotal: 0 };
            currentDiet.types.push(currentType);
          }

          const qtyForTotalSpecies = parseFloat((qtyPerSpecies * currentDiet.animalCount).toFixed(4));
          currentType.ingredients.push({
            ingredientName,
            qtyPerSpecies: parseFloat(qtyPerSpecies.toFixed(4)),
            qtyForTotalSpecies,
            uom,
          });
        });

        // Calculate totalRowsInGroup and sort
        groupsMap.forEach(group => {
          group.totalRowsInGroup = 0;
          // Sort diets: by raw name, then by common name, then by meal start time
          group.diets.sort((a,b) => {
            const dietComp = a.dietNameRaw.localeCompare(b.dietNameRaw);
            if (dietComp !== 0) return dietComp;
            const speciesComp = a.commonName.localeCompare(b.commonName);
            if (speciesComp !== 0) return speciesComp;
            return a.mealStartTime.localeCompare(b.mealStartTime);
          });

          group.diets.forEach(diet => {
            diet.types.sort((a,b) => a.typeName.localeCompare(b.typeName));
            diet.types.forEach(type => {
              type.ingredients.sort((a,b) => a.ingredientName.localeCompare(b.ingredientName));
              type.plannedQtyTypeTotal = parseFloat(type.ingredients.reduce((sum, ing) => sum + ing.qtyForTotalSpecies, 0).toFixed(4));
              // Each ingredient row + 1 subtotal row per type
              group.totalRowsInGroup += type.ingredients.length + 1;
            });
          });
        });

        const finalDisplayData = Array.from(groupsMap.values()).sort((a,b) => a.groupName.localeCompare(b.groupName));
        setComparisonDisplayData(finalDisplayData);

      } catch (e) {
        console.error("Error processing comparison data:", e);
        toast({ variant: "destructive", title: "Comparison Data Error", description: "Could not structure data for comparison." });
        setComparisonDisplayData([]);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === "comparison" && (!hasAppliedFilters || rawData.length === 0)) {
        // Clear comparison data if filters are not applied or no raw data
        setComparisonDisplayData([]);
        setIsLoading(false);
    }
  }, [activeTab, hasAppliedFilters, rawData, filters, allHeaders, toast]);


  const handleFileSelectedCallback = useCallback((base64Content: string, fileName: string) => {
    setIsLoading(true);
    setRawFileBase64(base64Content);
    const cleanFileName = fileName.replace(/\.(xlsx|xls)$/i, '');
    setRawFileName(cleanFileName);

    // Reset all data states
    setRawData([]);
    setAllHeaders([]);
    setFilters([]);
    setHasAppliedFilters(false);
    setIsFileSelected(true);
    setActiveTab("extractedData"); // Switch to extracted data view
    setActualQuantities({});
    setParsedActualSpeciesData([]);
    setComparisonDisplayData([]); // Clear comparison specific data

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
    setActualQuantities({}); // Reset actuals when filters change

    try {
        const result = await parseExcelFlow({ excelFileBase64: rawFileBase64, originalFileName: rawFileName });

        if (result.error) {
            toast({ variant: "destructive", title: "File Parsing Error", description: result.error });
            setRawData([]);
            setAllHeaders([]);
            setComparisonDisplayData([]); // Clear comparison data on error
            setIsLoading(false);
            return;
        }

        setRawData(result.parsedData);
        setAllHeaders(result.headers);

        // Logic for setting default groupings and summaries for "View Data" / "Export Sections"
        const requiredDefaultPivotCols = [
            ...DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => col as string),
            ...DEFAULT_IMAGE_PIVOT_SUMMARIES.map(s => s.column)
        ];
        const canApplyDefaultImagePivot = requiredDefaultPivotCols.every(col => result.headers.includes(col as string));

        if (canApplyDefaultImagePivot) {
            setDefaultGroupings(DEFAULT_IMAGE_PIVOT_ROW_GROUPINGS.map(col => ({ column: col as string })));
            setDefaultSummaries(DEFAULT_IMAGE_PIVOT_SUMMARIES);
        } else {
            const canApplySpecialUOMPivot =
                SPECIAL_PIVOT_UOM_ROW_GROUPINGS.every(col => result.headers.includes(col as string)) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_COLUMN_FIELD as string) &&
                result.headers.includes(SPECIAL_PIVOT_UOM_VALUE_FIELD as string);

            if (canApplySpecialUOMPivot) {
                setDefaultGroupings(SPECIAL_PIVOT_UOM_ROW_GROUPINGS.map(col => ({ column: col as string })));
                setDefaultSummaries([{ column: SPECIAL_PIVOT_UOM_VALUE_FIELD as string, type: 'sum' }]);
            } else {
                // More robust fallback for "View Data" / "Export Sections"
                const fallbackGroupingCandidates = ['group_name', 'common_name', 'diet_name', 'type_name', 'ingredient_name'];
                const availableFallbackGroupings = fallbackGroupingCandidates.filter(h => result.headers.includes(h as string));
                setDefaultGroupings(availableFallbackGroupings.length > 0
                    ? availableFallbackGroupings.slice(0,4).map(col => ({ column: col as string })) // Max 4 for default
                    : result.headers.length > 0 ? [{ column: result.headers[0] }] : []);

                const fallbackSummaries: SummarizationOption[] = [];
                if (result.headers.includes('ingredient_qty')) {
                    fallbackSummaries.push({ column: 'ingredient_qty', type: 'sum' });
                }
                if (result.headers.includes('base_uom_name')) { // For UOM display
                    fallbackSummaries.push({ column: 'base_uom_name', type: 'first'});
                }
                if (result.headers.includes('total_animal')) { // For animal count display
                    fallbackSummaries.push({ column: 'total_animal', type: 'first'});
                }
                // Add a generic numeric column if no specific ones are found
                if (fallbackSummaries.length === 0 && result.parsedData.length > 0) {
                    const firstDataRow = result.parsedData[0];
                    const someNumericHeader = result.headers.find(h => typeof firstDataRow[h] === 'number');
                    if (someNumericHeader) {
                        fallbackSummaries.push({column: someNumericHeader, type: 'sum'});
                    } else if (result.headers.length > 0) { // Default to first header if no numeric found
                        fallbackSummaries.push({column: result.headers[0], type: 'count'});
                    }
                }
                setDefaultSummaries(fallbackSummaries);
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
                description: `"${rawFileName}" processed. View data or switch to Comparison tab.`,
            });
        }

    } catch (error) {
        console.error("Error during 'Apply Filters' (including parsing):", error);
        toast({ variant: "destructive", title: "Processing Error", description: "An unexpected error occurred while parsing or filtering the file." });
        setRawData([]);
        setAllHeaders([]);
        setComparisonDisplayData([]); // Clear comparison data on error
    } finally {
        setIsLoading(false);
    }
  }, [isFileSelected, rawFileBase64, rawFileName, toast]);

  // Updated to include commonName in the key for ingredient-level actuals
  const buildActualQtyKey = (groupName: string, dietNameRaw: string, commonName: string, mealStartTime: string, typeName: string, ingredientName?: string) => {
    let key = `${groupName}|${dietNameRaw}|${commonName}|${mealStartTime}|${typeName}`;
    if (ingredientName) {
      key += `|${ingredientName}`;
    } else {
      key += `|__TYPE_SUBTOTAL__`; // For type-level actual quantity
    }
    return key;
  };

  // actualKey should now be the full composite key
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

        comparisonDisplayData.forEach((group) => { // Group is ComparisonPageGroup
            if (!firstPageOverall) doc.addPage(); else firstPageOverall = false;
            doc.setFontSize(14);
            doc.text(`Group: ${group.groupName}`, 40, 30);
            let currentY = 50;

            group.diets.forEach((diet, dietIdx) => { // Diet is ComparisonPageDiet
                if (dietIdx > 0 && currentY > 50) currentY += 15; // Add space between diets unless it's the first diet on a new page

                // Check for page break before starting a new diet, if not the first diet in the group
                if (currentY > doc.internal.pageSize.height - 120 && group.diets.length > 1) { // 120 as threshold for header + a few rows
                    doc.addPage();
                    currentY = 40;
                    doc.setFontSize(14);
                    doc.text(`Group: ${group.groupName} (Continued)`, 40, 30); // Group Header
                    currentY += 20;
                }

                doc.setFontSize(12);
                doc.text(`Diet/Species/Meal: ${diet.dietNameDisplay}`, 40, currentY); // Diet Header including species and animal count
                currentY += 20;

                diet.types.forEach((type, typeIdx) => { // Type is ComparisonPageType
                    if (typeIdx > 0 && currentY > (dietIdx === 0 && typeIdx === 0 ? 70 : 50)) currentY += 10;

                    // Check for page break before starting a new type table
                    if (currentY > doc.internal.pageSize.height - 100) { // 100 as threshold for type subtotal + a few ingredients
                        doc.addPage();
                        currentY = 40;
                        doc.setFontSize(14);
                        doc.text(`Group: ${group.groupName} (Continued)`, 40, 30);
                        currentY += 20;
                        doc.setFontSize(12);
                        doc.text(`Diet/Species/Meal: ${diet.dietNameDisplay} (Continued)`, 40, currentY);
                        currentY += 20;
                    }

                    const head = [['Type Name', 'Ingredient Name', 'Qty/1 Species', 'Qty/Total Species', 'Qty to Receive', 'Qty Received', 'Difference']];
                    const body = [];

                    // Add ingredients for this type
                    type.ingredients.forEach(ing => { // ing is ComparisonPageIngredient
                        const actualIngKey = buildActualQtyKey(group.groupName, diet.dietNameRaw, diet.commonName, diet.mealStartTime, type.typeName, ing.ingredientName);
                        const actualQtyStr = actualQuantities[actualIngKey] || '';
                        const actualQtyNum = parseFloat(actualQtyStr);
                        let diffStr = '';
                        if (actualQtyStr !== '' && !isNaN(actualQtyNum)) {
                            diffStr = (actualQtyNum - ing.qtyForTotalSpecies).toFixed(4);
                        }
                        body.push([
                            ing === type.ingredients[0] ? type.typeName : '', // Show type name only for the first ingredient of that type
                            ing.ingredientName,
                            ing.qtyPerSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''),
                            ing.qtyForTotalSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''),
                            ing.qtyForTotalSpecies.toFixed(4) + (ing.uom ? ` ${ing.uom}` : ''), // "Qty to be Received"
                            actualQtyStr,
                            diffStr
                        ]);
                    });

                    // Add subtotal row for the type
                    const actualTypeKey = buildActualQtyKey(group.groupName, diet.dietNameRaw, diet.commonName, diet.mealStartTime, type.typeName);
                    const actualTypeQtyStr = actualQuantities[actualTypeKey] || '';
                    const actualTypeQtyNum = parseFloat(actualTypeQtyStr);
                    let diffTypeStr = '';
                    if (actualTypeQtyStr !== '' && !isNaN(actualTypeQtyNum)) {
                        diffTypeStr = (actualTypeQtyNum - type.plannedQtyTypeTotal).toFixed(4);
                    }
                    body.push([
                        { content: type.typeName, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } },
                        { content: 'SUBTOTAL', styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230] } },
                        { content: '', styles: {fillColor: [230,230,230]}}, // Empty for Qty/1 Species
                        { content: '', styles: {fillColor: [230,230,230]}}, // Empty for Qty/Total Species
                        { content: type.plannedQtyTypeTotal.toFixed(4) + (type.ingredients[0]?.uom ? ` ${type.ingredients[0].uom}` : ''), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } },
                        { content: actualTypeQtyStr, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } },
                        { content: diffTypeStr, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230,230,230] } }
                    ]);

                    autoTable(doc, {
                        head: head,
                        body: body,
                        startY: currentY,
                        theme: 'grid',
                        headStyles: { fillColor: [38, 153, 153], textColor: [255,255,255], fontSize: 7, cellPadding: 2},
                        styles: { fontSize: 7, cellPadding: 2, overflow: 'ellipsize'},
                        columnStyles: {
                            0: { cellWidth: 80 }, 1: { cellWidth: 100 }, // Type Name, Ingredient Name
                            2: { cellWidth: 60, halign: 'right' }, 3: { cellWidth: 60, halign: 'right' }, // Qty/1, Qty/Total
                            4: { cellWidth: 70, halign: 'right' }, 5: { cellWidth: 60, halign: 'right' }, // Qty to Receive, Qty Received
                            6: { cellWidth: 60, halign: 'right' }, // Difference
                        },
                        didParseCell: function (data) { // Color difference
                            if (data.column.index === 6) { // Difference column
                                 const cellRawValue = data.cell.raw;
                                 if (cellRawValue !== null && cellRawValue !== undefined && String(cellRawValue).trim() !== '') {
                                    const numericValue = parseFloat(String(cellRawValue));
                                    if (!isNaN(numericValue)) {
                                        if (numericValue < 0) data.cell.styles.textColor = [220, 53, 69]; // Red
                                        else if (numericValue > 0) data.cell.styles.textColor = [0, 123, 255]; // Blue
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
        doc.save(`${rawFileName}_comparison_report.pdf`);
        toast({ title: "PDF Download Started", description: `Your Comparison report PDF is being generated.` });
        return;
    }

    // PDF Export for "View Data" and "Export Sections" (remains largely the same)
    let dataToExport: DietDataRow[] = [];
    let columnsToExport: string[] = [];
    let grandTotalToExport: DietDataRow | undefined = undefined;

    if (activeTab === "extractedData" || activeTab === "exportSections") {
        dataToExport = processedData.map(row => ({...row})); // Use 'processedData' from useTableProcessor
        columnsToExport = [...currentTableColumns]; // Use 'currentTableColumns' from useTableProcessor
        grandTotalToExport = grandTotalRow ? {...grandTotalRow} : undefined; // Use 'grandTotalRow'

        // Concatenate UOM for display in PDF (same logic as before)
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
             if (uomKey !== ingredientQtySumKey) { // Remove separate UOM column if concatenated
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
     // This function serves "Export Sections" tab and uses data processed by useTableProcessor
     const sectionTableData = {
         processedData: sectionTableDataInput.processedData.map(row => ({...row})),
         columns: [...sectionTableDataInput.columns],
         grandTotalRow: sectionTableDataInput.grandTotalRow ? {...sectionTableDataInput.grandTotalRow} : undefined
     };

     // UOM concatenation for PDF (same logic as before)
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
    comparisonDisplayData.forEach(group => { // Iterating ComparisonPageGroup
        group.diets.forEach(diet => { // Iterating ComparisonPageDiet
            // One record per diet (which includes species)
            const groupRecord: any = {
                group_id: group.groupName, // Matches user's suggested JSON
                species: diet.commonName, // Matches user's suggested JSON (species name)
                meal_time: diet.mealStartTime, // Matches user's suggested JSON
                // diet_name_raw: diet.dietNameRaw, // Optional for more context if needed by backend
                // animal_count: diet.animalCount, // Optional
                ingredients: [],
            };

            diet.types.forEach(type => { // Iterating ComparisonPageType
                // Adding ingredients from each type to the diet's ingredient list
                type.ingredients.forEach(ing => { // Iterating ComparisonPageIngredient
                    const actualIngKey = buildActualQtyKey(group.groupName, diet.dietNameRaw, diet.commonName, diet.mealStartTime, type.typeName, ing.ingredientName);
                    const actualIngQtyStr = actualQuantities[actualIngKey] || '';

                    groupRecord.ingredients.push({
                        name: ing.ingredientName, // Matches user's suggested JSON
                        planned_qty: ing.qtyForTotalSpecies, // Matches user's suggested 'planned_qty' for total animals
                        actual_qty: actualIngQtyStr !== '' ? (parseFloat(actualIngQtyStr) || null) : null, // Matches user's suggested JSON
                        // uom: ing.uom, // Optional for backend context
                        // planned_qty_per_species: ing.qtyPerSpecies, // Optional
                        // type_name: type.typeName // Optional for more granular context if needed
                    });
                });
            });
            dataToSave.push(groupRecord);
        });
    });

    const jsonData = JSON.stringify(dataToSave, null, 2);
    console.log("Data prepared for saving (JSON):", jsonData);
    toast({
        title: "Data Prepared for Backend",
        description: "Check the browser console for the JSON data. Implement backend logic to save this.",
        duration: 10000,
    });
  };

  const year = new Date().getFullYear();

  const renderContentForDataTabs = (isExportTab: boolean, isComparisonTab: boolean = false) => {
    if (isLoading && !isComparisonTab) { // Loading for View Data / Export Sections
      return (
        <Card><CardHeader><CardTitle>Processing...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>
      );
    }
     if (isComparisonTab && isLoading) { // Specific loading message for comparison structuring
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

    // Messages for "View Data" / "Export Sections" tabs
    if (!isComparisonTab) {
        if (rawData.length === 0 && allHeaders.length > 0 && hasAppliedFilters) {
            return <Card><CardContent className="p-6 text-center text-muted-foreground">File "<strong>{rawFileName}</strong>" contains only headers.</CardContent></Card>;
        }
        if (rawData.length === 0 && allHeaders.length === 0 && hasAppliedFilters) {
            return <Card><CardContent className="p-6 text-center text-destructive">No data or headers extracted from "<strong>{rawFileName}</strong>".</CardContent></Card>;
        }
        if (processedData.length === 0 && rawData.length > 0 && hasAppliedFilters ) { // processedData from useTableProcessor
           return <Card><CardContent className="p-6 text-center text-muted-foreground">Filters for "<strong>{rawFileName}</strong>" resulted in no data for the current view.</CardContent></Card>;
        }
    }


    // --- Comparison Tab Rendering ---
    if (isComparisonTab) {
        if (isLoadingActualSpeciesFile) { // Loading for the secondary species file
            return <Card><CardHeader><CardTitle>Loading Species File...</CardTitle></CardHeader><CardContent className="p-6 flex justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent></Card>;
        }
        if (comparisonDisplayData.length === 0 && rawData.length > 0 && hasAppliedFilters) {
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
        // Helper to render rows for the comparison table with simulated rowspans
        const renderComparisonRows = () => {
            const rows: JSX.Element[] = [];
            comparisonDisplayData.forEach((group) => { // group is ComparisonPageGroup
                let isFirstRowOfGroup = true;
                group.diets.forEach((diet) => { // diet is ComparisonPageDiet
                    let isFirstRowOfDiet = true;
                    diet.types.forEach((type) => { // type is ComparisonPageType
                        const typeActualKey = buildActualQtyKey(group.groupName, diet.dietNameRaw, diet.commonName, diet.mealStartTime, type.typeName);
                        const typeActualQtyStr = actualQuantities[typeActualKey] || '';
                        const typeActualQtyNum = parseFloat(typeActualQtyStr);
                        let typeDiff = NaN;
                        if (!isNaN(typeActualQtyNum)) {
                            typeDiff = typeActualQtyNum - type.plannedQtyTypeTotal;
                        }

                        // Render the Type Subtotal Row
                        rows.push(
                            <ShadcnTableRow key={`${typeActualKey}_subtotal`} className="bg-muted/50 dark:bg-muted/30 font-semibold hover:bg-muted">
                                {isFirstRowOfGroup && <ShadcnTableCell rowSpan={group.totalRowsInGroup} className="border align-top pt-2">{group.groupName}</ShadcnTableCell>}
                                {isFirstRowOfDiet && <ShadcnTableCell rowSpan={diet.types.reduce((acc, t) => acc + t.ingredients.length + 1, 0)} className="border align-top pt-2">{diet.dietNameDisplay}</ShadcnTableCell>}
                                <ShadcnTableCell className="border text-left italic">Mix: {type.typeName}</ShadcnTableCell>
                                <ShadcnTableCell className="border text-right italic">SUBTOTAL (Mix)</ShadcnTableCell>
                                <ShadcnTableCell className="border text-right"></ShadcnTableCell> {/* Empty for Qty/1 Species */}
                                <ShadcnTableCell className="border text-right"></ShadcnTableCell> {/* Empty for Qty/Total Species */}
                                <ShadcnTableCell className="border text-right">{type.plannedQtyTypeTotal.toFixed(4)}</ShadcnTableCell>
                                <ShadcnTableCell className="border text-right">
                                    <Input
                                        type="number" step="any"
                                        value={typeActualQtyStr}
                                        onChange={(e) => handleActualQuantityChange(typeActualKey, e.target.value)}
                                        className="h-8 text-right w-full min-w-[80px]"
                                    />
                                </ShadcnTableCell>
                                <ShadcnTableCell className={`border text-right ${typeDiff < 0 ? 'text-red-600 dark:text-red-400' : typeDiff > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                    {!isNaN(typeDiff) ? typeDiff.toFixed(4) : ''}
                                </ShadcnTableCell>
                            </ShadcnTableRow>
                        );
                        isFirstRowOfGroup = false; // After the first row (type subtotal or ingredient) of this group, set to false
                        
                        let isFirstIngredientOfTypeForDietDisplay = true;

                        // Render Ingredient Rows for this Type
                        type.ingredients.forEach((ing) => { // ing is ComparisonPageIngredient
                            const ingActualKey = buildActualQtyKey(group.groupName, diet.dietNameRaw, diet.commonName, diet.mealStartTime, type.typeName, ing.ingredientName);
                            const ingActualQtyStr = actualQuantities[ingActualKey] || '';
                            const ingActualQtyNum = parseFloat(ingActualQtyStr);
                            let ingDiff = NaN;
                            if (!isNaN(ingActualQtyNum)) {
                                ingDiff = ingActualQtyNum - ing.qtyForTotalSpecies;
                            }
                            rows.push(
                                <ShadcnTableRow key={ingActualKey} className="hover:bg-accent/10">
                                     {/* Group Name and Diet Name cells are handled by rowSpan logic above */}
                                    <ShadcnTableCell className="border text-left pl-4">{type.typeName === "Unknown Type" ? "" : type.typeName}</ShadcnTableCell> {/* Type Name column */}
                                    <ShadcnTableCell className="border text-left">{ing.ingredientName}</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right">{ing.qtyPerSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right">{ing.qtyForTotalSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell>
                                    <ShadcnTableCell className="border text-right">{ing.qtyForTotalSpecies.toFixed(4)} {ing.uom}</ShadcnTableCell> {/* Qty to be Received */}
                                    <ShadcnTableCell className="border text-right">
                                        <Input
                                            type="number" step="any"
                                            value={ingActualQtyStr}
                                            onChange={(e) => handleActualQuantityChange(ingActualKey, e.target.value)}
                                            className="h-8 text-right w-full min-w-[80px]"
                                        />
                                    </ShadcnTableCell>
                                    <ShadcnTableCell className={`border text-right ${ingDiff < 0 ? 'text-red-600 dark:text-red-400' : ingDiff > 0 ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                        {!isNaN(ingDiff) ? ingDiff.toFixed(4) : ''}
                                    </ShadcnTableCell>
                                </ShadcnTableRow>
                            );
                             isFirstIngredientOfTypeForDietDisplay = false; 
                        });
                        isFirstRowOfDiet = false; // After the first type (and its ingredients) within a diet, set to false
                    });
                });
            });
            return rows;
        };

        return (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Header section with file upload and download buttons */}
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-2">
                    {/* Placeholder for future controls if needed */}
                </div>
                <div className="flex flex-col items-end space-y-2">
                     <FileUpload
                        onFileSelected={handleActualSpeciesFileSelectedCallback}
                        onProcessing={setIsLoadingActualSpeciesFile}
                        disabled={isLoadingActualSpeciesFile || !hasAppliedFilters}
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

            {/* Scrollable Table Area */}
            <ScrollArea className="flex-1 -mx-4 px-4"> {/* Adjust margins/padding for better scroll */}
                <ShadcnTable className="min-w-full border-collapse border border-muted">
                    <ShadcnTableHeader className="sticky top-0 bg-card z-10"> {/* Sticky header */}
                        <ShadcnTableRow>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[150px] text-left">Group Name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[300px] text-left">Diet / Species / Meal</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[150px] text-left">Type Name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 w-[200px] text-left">Ingredient Name</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[120px]">Qty/1 Species</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[120px]">Qty/Total Species</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[120px]">Qty to be Received</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[120px]">Qty Received</ShadcnTableHead>
                            <ShadcnTableHead className="border border-muted px-2 py-1 text-right w-[100px]">Difference</ShadcnTableHead>
                        </ShadcnTableRow>
                    </ShadcnTableHeader>
                    <ShadcnTableBody>
                        {comparisonDisplayData.length > 0 ? renderComparisonRows() : (
                            <ShadcnTableRow>
                                <ShadcnTableCell colSpan={9} className="text-center py-10 text-muted-foreground">
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


    // --- "View Data" and "Export Sections" Tabs Rendering (uses DataTable) ---
    if (isExportTab) { // "Export Sections" Tab
      const getSectionData = (sectionNameValue: string) => {
          // Logic to filter rawData for this specific section and then process it
          // This uses the main 'filters' from SimpleFilterPanel
          const rawDataForThisSection = rawData.filter(row => {
            const sectionMatch = String(row.section_name || '').trim() === sectionNameValue;
            if (!sectionMatch) return false;
            // Apply global filters to section data
             return filters.every(filter => {
                // This logic needs to be robust, similar to how useTableProcessor filters
                // For simplicity, we assume calculateProcessedTableData handles filtering correctly when passed to it.
                // Here, we filter rawData BEFORE passing to section-specific calculateProcessedTableData
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
          // Process this section's filtered data with default groupings/summaries for display
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
                  if (sectionTableData.processedData.length === 0) { // If no data for this section after global filters
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
                      <CardContent className="min-h-0 pt-0 p-0"> {/* Ensure no extra padding */}
                         <div style={{ height: 'auto', maxHeight: '600px', overflowY: 'auto' }}> {/* Scroll for individual section table */}
                          <DataTable
                            data={sectionTableData.processedData}
                            columns={sectionTableData.columns}
                            grandTotalRow={sectionTableData.grandTotalRow}
                            allHeaders={allHeaders} // Pass allHeaders for UOM logic in DataTable
                          />
                         </div>
                      </CardContent>
                    </Card>
                  );
              }) : ( // No unique sections found AT ALL after global filters
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
    } else { // "View Data" Tab
      return (
        <div className="flex-1 min-h-0"> {/* Ensure DataTable takes available space */}
          <DataTable
            data={processedData} // from useTableProcessor
            columns={currentTableColumns} // from useTableProcessor
            grandTotalRow={grandTotalRow} // from useTableProcessor
            allHeaders={allHeaders} // Pass allHeaders for UOM logic in DataTable
          />
        </div>
      );
    }
  };


  return (
    <main className="min-h-screen text-foreground flex flex-col bg-transparent"> {/* Removed bg-background */}
      <header className="px-4 py-3 border-b flex items-center justify-between bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <DietWiseLogo />
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


          <TabsContent value="extractedData" className="mt-2 flex flex-col flex-1 min-h-0"> {/* flex-1 and min-h-0 for layout */}
             <div className="flex flex-col flex-1 min-h-0 space-y-4 pt-4"> {/* Ensure this container also helps with layout */}
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

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-auto bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto">
          DietWise &copy; {year}
        </div>
      </footer>
    </main>
  );
}
    

    
