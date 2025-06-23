"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [pendingDropdownFilters, setPendingDropdownFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialDropdowns: Record<string, string> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      const applied = appliedFilters.find(f => f.column === key && f.type === 'equals');
      if (applied) {
        initialDropdowns[key] = String(applied.value).toLowerCase();
      } else {
        initialDropdowns[key] = '';
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
    Object.entries(pendingDropdownFilters).forEach(([column, value]) => {
      if (value && FILTERABLE_COLUMNS.some(fc => fc.key === column)) {
        const originalLabel = uniqueValues[column]?.find(v => v.value === value)?.label || value;
        newCombinedFilters.push({ column, value: originalLabel, type: 'equals' });
      }
    });
    onApplyFilters(newCombinedFilters);
  }, [pendingDropdownFilters, onApplyFilters, disabled, uniqueValues]);
  
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
              <Select
                value={pendingDropdownFilters[key] || ''}
                onValueChange={(value) => {
                  setPendingDropdownFilters(prev => ({...prev, [key]: value}));
                }}
                disabled={disabled || (!hasOptions && allHeaders.length > 0)}
              >
                <SelectTrigger id={`filter-${key}`} className="w-full h-10 text-sm">
                   <SelectValue placeholder={hasOptions ? placeholder : (allHeaders.length > 0 ? `No ${label} data` : 'Loading...')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    {currentUniqueValues.map(val => (
                        <SelectItem key={val.value} value={val.value}>
                            {val.label}
                        </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
