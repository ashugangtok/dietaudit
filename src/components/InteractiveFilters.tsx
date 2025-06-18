
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DietDataRow, FilterOption } from '@/types';
import { Filter, CheckSquare } from 'lucide-react';

interface InteractiveFiltersProps {
  rawData: DietDataRow[];
  allHeaders: string[];
  appliedFilters: FilterOption[]; 
  onApplyFilters: (filters: FilterOption[]) => void;
  disabled?: boolean;
}

const FILTERABLE_COLUMNS = [
  { key: 'site_name', label: 'Site Name', placeholder: 'All Sites' },
  { key: 'section_name', label: 'Section Name', placeholder: 'All Sections' },
  { key: 'user_enclosure_name', label: 'Enclosure Name', placeholder: 'All Enclosures' },
  { key: 'group_name', label: 'Group Name', placeholder: 'All Groups' },
  { key: 'common_name', label: 'Species Name (Common)', placeholder: 'All Species' },
  { key: 'diet_name', label: 'Diet Name', placeholder: 'All Diets' },
  { key: 'class_name', label: 'Class Name', placeholder: 'All Classes'},
];

const InteractiveFilters: React.FC<InteractiveFiltersProps> = ({
  rawData, // rawData is now the fully parsed data, available after "Apply Filters"
  allHeaders, // allHeaders are available after "Apply Filters"
  appliedFilters, 
  onApplyFilters,
  disabled = false,
}) => {
  const [pendingDropdownFilters, setPendingDropdownFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialDropdowns: Record<string, string> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      initialDropdowns[key] = 'all'; 
    });

    appliedFilters.forEach(filter => {
      if (FILTERABLE_COLUMNS.some(fc => fc.key === filter.column) && filter.type === 'equals') {
        initialDropdowns[filter.column] = String(filter.value);
      }
    });
    setPendingDropdownFilters(initialDropdowns);
  }, [appliedFilters]);


  const uniqueValues = useMemo(() => {
    const uVals: Record<string, string[]> = {};
    if (allHeaders.length > 0 && rawData.length > 0) { // Only compute if headers and rawData are populated
        FILTERABLE_COLUMNS.forEach(({ key }) => {
            if (allHeaders.includes(key)) {
                const values = [...new Set(rawData.map(row => String(row[key] || '')).filter(val => val.trim() !== ''))].sort();
                uVals[key] = values;
            }
        });
    }
    return uVals;
  }, [rawData, allHeaders]);


  const handlePendingDropdownChange = (column: string, value: string) => {
    setPendingDropdownFilters(prev => ({ ...prev, [column]: value }));
  };

  const handleApplyFiltersInternal = useCallback(() => {
    if (disabled) return;
    const newFilters: FilterOption[] = [];
    Object.entries(pendingDropdownFilters).forEach(([column, value]) => {
      if (value !== 'all' && FILTERABLE_COLUMNS.some(fc => fc.key === column)) {
        newFilters.push({ column, value, type: 'equals' });
      }
    });
    onApplyFilters(newFilters);
  }, [pendingDropdownFilters, onApplyFilters, disabled]);


  return (
    <div className="p-4 bg-card rounded-lg shadow mb-6 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium flex items-center text-primary">
          <Filter className="mr-2 h-5 w-5" /> Filters
        </h3>
      </div>
      
      {allHeaders.length === 0 && !disabled && (
         <p className="text-sm text-muted-foreground">
            Select a file and click "Apply Filters" once to populate filter options based on your data.
          </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {FILTERABLE_COLUMNS.map(({ key, label, placeholder }) => {
          // Only render if headers are available, or always render but disable if no headers/uniqueValues
          if (allHeaders.length === 0 && !Object.keys(uniqueValues).includes(key)) {
            // Render a disabled-looking placeholder if headers aren't ready
             return (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`filter-${key}`} className="text-sm font-medium text-muted-foreground/70">{label}</Label>
                  <Select disabled={true}>
                    <SelectTrigger id={`filter-${key}`}>
                      <SelectValue placeholder={`Loading ${label} options...`} />
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
            );
          }

          const currentUniqueValues = uniqueValues[key];
          const hasOptions = currentUniqueValues && currentUniqueValues.length > 0;

          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</Label>
              <Select
                value={pendingDropdownFilters[key] || 'all'}
                onValueChange={(value) => handlePendingDropdownChange(key, value)}
                disabled={disabled || !hasOptions}
              >
                <SelectTrigger id={`filter-${key}`}>
                  <SelectValue placeholder={hasOptions ? placeholder : `No ${label} data`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{placeholder}</SelectItem>
                  {currentUniqueValues?.map(val => (
                    <SelectItem key={val} value={val}>{val}</SelectItem>
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

export default InteractiveFilters;
