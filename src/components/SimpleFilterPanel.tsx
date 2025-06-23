
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DietDataRow, FilterOption } from '@/types';
import { Filter, CheckSquare } from 'lucide-react';

const FILTERABLE_COLUMNS = [
  { key: 'site_name', label: 'Site Name', placeholder: 'Select Site...' },
  { key: 'section_name', label: 'Section Name', placeholder: 'Select Section...' },
  { key: 'user_enclosure_name', label: 'Enclosure Name', placeholder: 'Select Enclosure...' },
  { key: 'group_name', label: 'Group Name', placeholder: 'Select Group...' },
  { key: 'common_name', label: 'Species Name (Common)', placeholder: 'Select Species...' },
  { key: 'diet_name', label: 'Diet Name', placeholder: 'Select Diet...' },
  { key: 'class_name', label: 'Class Name', placeholder: 'Select Class...'},
  { key: 'meal_start_time', label: 'Meal Start Time', placeholder: 'Select Time...'},
];

interface SimpleFilterPanelProps {
  rawData: DietDataRow[];
  allHeaders: string[];
  appliedFilters: FilterOption[];
  onApplyFilters: (filters: FilterOption[]) => void;
  disabled?: boolean;
}

const SimpleFilterPanel: React.FC<SimpleFilterPanelProps> = ({
  rawData,
  allHeaders,
  appliedFilters,
  onApplyFilters,
  disabled = false,
}) => {
  const [pendingDropdownFilters, setPendingDropdownFilters] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    const initialDropdowns: Record<string, Set<string>> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      const applied = appliedFilters.find(f => f.column === key && f.type === 'in');
      if (applied && Array.isArray(applied.value)) {
        const valuesToSet = new Set(applied.value.map(v => String(v).toLowerCase()));
        initialDropdowns[key] = valuesToSet;
      } else {
        initialDropdowns[key] = new Set();
      }
    });
    setPendingDropdownFilters(initialDropdowns);
  }, [appliedFilters]);

  const uniqueValues = useMemo(() => {
    const uVals: Record<string, { value: string; label: string }[]> = {};
    if (allHeaders.length > 0 && rawData.length > 0) {
      FILTERABLE_COLUMNS.forEach(({ key }) => {
        if (allHeaders.includes(key)) {
          const values = [...new Set(rawData.map(row => String(row[key] || '').trim()).filter(val => val !== ''))].sort();
          uVals[key] = values.map(v => ({ value: v.toLowerCase(), label: v }));
        }
      });
    }
    return uVals;
  }, [rawData, allHeaders]);

  const handleApplyFiltersInternal = useCallback(() => {
    if (disabled) return;
    const newCombinedFilters: FilterOption[] = [];
    Object.entries(pendingDropdownFilters).forEach(([column, valueSet]) => {
      if (valueSet.size > 0 && FILTERABLE_COLUMNS.some(fc => fc.key === column)) {
        const originalLabels = Array.from(valueSet).map(selectedValue => {
            return uniqueValues[column]?.find(v => v.value === selectedValue)?.label || selectedValue;
        });
        newCombinedFilters.push({ column, value: originalLabels, type: 'in' });
      }
    });
    onApplyFilters(newCombinedFilters);
  }, [pendingDropdownFilters, onApplyFilters, disabled, uniqueValues]);

  const handleSelectionChange = (columnKey: string, value: string, checked: boolean) => {
    setPendingDropdownFilters(prev => {
        const newSet = new Set(prev[columnKey] || []);
        if (checked) {
            newSet.add(value);
        } else {
            newSet.delete(value);
        }
        return {
            ...prev,
            [columnKey]: newSet,
        };
    });
  };

  const getButtonLabel = (key: string, placeholder: string) => {
    const selectedCount = pendingDropdownFilters[key]?.size || 0;
    if (selectedCount === 0) {
      return placeholder;
    }
    const allOptionsCount = uniqueValues[key]?.length;
    if (allOptionsCount && selectedCount === allOptionsCount) {
      const label = FILTERABLE_COLUMNS.find(c => c.key === key)?.label.replace(' Name', '') || 'Items';
      return `All ${label}s`;
    }
    if (selectedCount === 1) {
      const selectedValue = pendingDropdownFilters[key].values().next().value;
      return uniqueValues[key]?.find(v => v.value === selectedValue)?.label || '1 selected';
    }
    return `${selectedCount} selected`;
  };

  return (
    <div className="p-4 bg-card rounded-lg shadow mb-6 space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium flex items-center text-primary">
          <Filter className="mr-2 h-5 w-5" /> Filters
        </h3>
      </div>

      {allHeaders.length === 0 && !disabled && (
         <p className="text-sm text-muted-foreground">
            Select a file and click "Apply Filters" once to populate filter options based on your data.
          </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {FILTERABLE_COLUMNS.map(({ key, label, placeholder }) => {
          if (allHeaders.length > 0 && !uniqueValues[key]) {
            return null;
          }
          
          const currentUniqueValues = uniqueValues[key] || [];
          const hasOptions = currentUniqueValues.length > 0;
          
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id={`filter-${key}`}
                    variant="outline"
                    className="w-full justify-start font-normal h-10 text-sm"
                    disabled={disabled || (!hasOptions && allHeaders.length > 0)}
                  >
                    <span className="truncate">{getButtonLabel(key, hasOptions ? placeholder : (allHeaders.length > 0 ? `No ${label} data` : 'Loading...'))}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                   <ScrollArea className="h-72">
                        <div className="p-4">
                        {currentUniqueValues.map(val => (
                            <div key={val.value} className="flex items-center space-x-2 mb-2">
                                <Checkbox
                                    id={`${key}-${val.value}`}
                                    checked={pendingDropdownFilters[key]?.has(val.value) || false}
                                    onCheckedChange={(checked) => handleSelectionChange(key, val.value, !!checked)}
                                />
                                <Label htmlFor={`${key}-${val.value}`} className="font-normal truncate cursor-pointer">{val.label}</Label>
                            </div>
                        ))}
                        </div>
                   </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleApplyFiltersInternal} size="lg" disabled={disabled}>
          <CheckSquare className="mr-2 h-5 w-5" /> Apply Filters
        </Button>
      </div>
    </div>
  );
};

export default SimpleFilterPanel;
