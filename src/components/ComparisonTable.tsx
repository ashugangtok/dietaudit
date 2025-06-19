
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

interface ComparisonItem {
  ingredientName: string;
  unitOfMeasure: string;
  plannedQty: number;
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ filteredData, allHeaders }) => {
  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});

  const comparisonItems = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return [];
    }

    const ingredientMap = new Map<string, { plannedQty: number; units: Set<string> }>();

    filteredData.forEach(row => {
      const ingredientName = String(row.ingredient_name || 'Unknown Ingredient').trim();
      const plannedQty = parseFloat(String(row.ingredient_qty || '0'));
      const unit = String(row.base_uom_name || '').trim();

      if (ingredientName === 'Unknown Ingredient' || isNaN(plannedQty)) {
        return;
      }

      if (!ingredientMap.has(ingredientName)) {
        ingredientMap.set(ingredientName, { plannedQty: 0, units: new Set<string>() });
      }

      const current = ingredientMap.get(ingredientName)!;
      current.plannedQty += plannedQty;
      if (unit) {
        current.units.add(unit);
      }
    });

    const items: ComparisonItem[] = [];
    ingredientMap.forEach((value, key) => {
      const unitsArray = Array.from(value.units);
      items.push({
        ingredientName: key,
        plannedQty: parseFloat(value.plannedQty.toFixed(4)), // Keep precision
        unitOfMeasure: unitsArray.length === 1 ? unitsArray[0] : (unitsArray.length > 1 ? 'Mixed' : ''),
      });
    });

    return items.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  }, [filteredData]);

  const handleActualQuantityChange = useCallback((ingredientName: string, value: string) => {
    setActualQuantities(prev => ({
      ...prev,
      [ingredientName]: value,
    }));
  }, []);

  if (comparisonItems.length === 0) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Ingredient Comparison</CardTitle>
          <CardDescription>Compare planned vs. actual ingredient quantities.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No ingredients to compare with the current filters. Adjust filters to see data.
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
          Enter actual quantities to compare against the planned amounts from your diet file.
          Data reflects current filter selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 md:p-6 md:pt-0">
        <ScrollArea className="h-full">
          <Table>
            <TableCaption>Planned vs. Actual Ingredient Quantities</TableCaption>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead>Ingredient Name</TableHead>
                <TableHead className="w-[120px]">Unit</TableHead>
                <TableHead className="text-right w-[150px]">Planned Qty</TableHead>
                <TableHead className="text-right w-[150px]">Actual Qty</TableHead>
                <TableHead className="text-right w-[150px]">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonItems.map(item => {
                const actualQtyStr = actualQuantities[item.ingredientName] || '';
                const actualQtyNum = parseFloat(actualQtyStr);
                const plannedQtyNum = item.plannedQty;
                let difference: string | number = '';
                let differenceStyle = {};

                if (actualQtyStr !== '' && !isNaN(actualQtyNum)) {
                  const diffValue = actualQtyNum - plannedQtyNum;
                  difference = parseFloat(diffValue.toFixed(4)); // Keep precision
                  if (diffValue > 0) differenceStyle = { color: 'hsl(var(--primary))', fontWeight: 'bold' }; // Positive, more given
                  if (diffValue < 0) differenceStyle = { color: 'hsl(var(--destructive))', fontWeight: 'bold' }; // Negative, less given
                }

                return (
                  <TableRow key={item.ingredientName}>
                    <TableCell className="font-medium">{item.ingredientName}</TableCell>
                    <TableCell>{item.unitOfMeasure}</TableCell>
                    <TableCell className="text-right">{plannedQtyNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={actualQtyStr}
                        onChange={(e) => handleActualQuantityChange(item.ingredientName, e.target.value)}
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
