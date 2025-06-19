
"use client";

import type React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { DietDataRow } from '@/types';

interface ComparisonTableProps {
  filteredData: DietDataRow[];
  allHeaders: string[];
}

interface ComparisonRow {
  id: string; // Unique ID for React key
  site_name?: string;
  section_name?: string;
  user_enclosure_name?: string;
  group_name?: string;
  common_name?: string; // Species Name
  diet_name?: string;
  meal_start_time?: string;
  type_name?: string;
  ingredient_name: string;
  unitOfMeasure: string;
  plannedQty: number;
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ filteredData }) => {
  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});

  const comparisonItems = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return [];
    }

    const items: ComparisonRow[] = filteredData
      .map((row, index) => {
        const plannedQty = parseFloat(String(row.ingredient_qty || '0'));
        if (String(row.ingredient_name || '').trim() === '' || isNaN(plannedQty)) {
          return null; 
        }
        return {
          id: `row-${index}-${row.ingredient_name}`,
          site_name: String(row.site_name || ''),
          section_name: String(row.section_name || ''),
          user_enclosure_name: String(row.user_enclosure_name || ''),
          group_name: String(row.group_name || ''),
          common_name: String(row.common_name || ''),
          diet_name: String(row.diet_name || ''),
          meal_start_time: String(row.meal_start_time || ''),
          type_name: String(row.type_name || ''),
          ingredient_name: String(row.ingredient_name || 'Unknown Ingredient').trim(),
          unitOfMeasure: String(row.base_uom_name || '').trim(),
          plannedQty: parseFloat(plannedQty.toFixed(4)),
        };
      })
      .filter(item => item !== null) as ComparisonRow[];

    return items.sort((a, b) => {
      const contextFields: (keyof ComparisonRow)[] = [
        'site_name', 'section_name', 'user_enclosure_name', 'group_name', 
        'common_name', 'diet_name', 'meal_start_time', 'ingredient_name'
      ];
      for (const field of contextFields) {
        const valA = String(a[field] || '').toLowerCase();
        const valB = String(b[field] || '').toLowerCase();
        if (valA < valB) return -1;
        if (valA > valB) return 1;
      }
      return 0;
    });
  }, [filteredData]);

  const handleActualQuantityChange = useCallback((id: string, value: string) => {
    setActualQuantities(prev => ({
      ...prev,
      [id]: value,
    }));
  }, []);

  if (comparisonItems.length === 0) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Ingredient Comparison</CardTitle>
          <CardDescription>Compare planned vs. actual ingredient quantities for each allocation.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No ingredient allocations to compare with the current filters. Adjust filters to see data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col min-h-0">
      <CardHeader>
        <CardTitle>Ingredient Comparison</CardTitle>
        <CardDescription>
          Enter actual quantities to compare against individual planned ingredient allocations from your diet file.
          Data reflects current filter selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 md:p-6 md:pt-0">
        <ScrollArea className="h-full">
          <Table>
            <TableCaption>Planned vs. Actual Ingredient Quantities (Individual Allocations)</TableCaption>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="min-w-[150px]">Site</TableHead>
                <TableHead className="min-w-[150px]">Section</TableHead>
                <TableHead className="min-w-[150px]">Enclosure</TableHead>
                <TableHead className="min-w-[150px]">Group</TableHead>
                <TableHead className="min-w-[150px]">Species</TableHead>
                <TableHead className="min-w-[180px]">Diet Name</TableHead>
                <TableHead className="min-w-[120px]">Meal Time</TableHead>
                <TableHead className="min-w-[150px]">Type Name</TableHead>
                <TableHead className="min-w-[200px] font-semibold">Ingredient Name</TableHead>
                <TableHead className="w-[100px]">Unit</TableHead>
                <TableHead className="text-right w-[130px]">Planned Qty</TableHead>
                <TableHead className="text-right w-[150px]">Actual Qty</TableHead>
                <TableHead className="text-right w-[130px]">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonItems.map(item => {
                const actualQtyStr = actualQuantities[item.id] || '';
                const actualQtyNum = parseFloat(actualQtyStr);
                const plannedQtyNum = item.plannedQty;
                let difference: string | number = '';
                let differenceStyle = {};

                if (actualQtyStr !== '' && !isNaN(actualQtyNum)) {
                  const diffValue = actualQtyNum - plannedQtyNum;
                  difference = parseFloat(diffValue.toFixed(4));
                  if (diffValue > 0) differenceStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' };
                  if (diffValue < 0) differenceStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' };
                }

                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.site_name}</TableCell>
                    <TableCell>{item.section_name}</TableCell>
                    <TableCell>{item.user_enclosure_name}</TableCell>
                    <TableCell>{item.group_name}</TableCell>
                    <TableCell>{item.common_name}</TableCell>
                    <TableCell>{item.diet_name}</TableCell>
                    <TableCell>{item.meal_start_time}</TableCell>
                    <TableCell>{item.type_name}</TableCell>
                    <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                    <TableCell>{item.unitOfMeasure}</TableCell>
                    <TableCell className="text-right">{plannedQtyNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={actualQtyStr}
                        onChange={(e) => handleActualQuantityChange(item.id, e.target.value)}
                        className="h-8 text-right"
                        placeholder="Enter actual"
                      />
                    </TableCell>
                    <TableCell className="text-right" style={differenceStyle}>
                      {typeof difference === 'number' ? difference.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : difference}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ComparisonTable;

    