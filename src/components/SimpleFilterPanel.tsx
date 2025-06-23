
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import type { DietDataRow, FilterOption } from '@/types';
import { Filter, CheckSquare, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialDropdowns: Record<string, string> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      const applied = appliedFilters.find(f => f.column === key && f.type === 'equals');
      initialDropdowns[key] = applied ? String(applied.value).toLowerCase() : '';
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
          if (allHeaders.length === 0 && !Object.keys(uniqueValues).includes(key)) {
              return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`filter-${key}`} className="text-sm font-medium text-muted-foreground/70">{label}</Label>
                    <Button variant="outline" role="combobox" aria-expanded="false" className="w-full justify-between h-10 text-sm" disabled>
                      {placeholder}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </div>
              );
          }
          const currentUniqueValues = uniqueValues[key] || [];
          const hasOptions = currentUniqueValues.length > 0;
          const selectedValue = currentUniqueValues.find(v => v.value === pendingDropdownFilters[key])?.label || "";

          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</Label>
              <Popover open={openPopovers[key]} onOpenChange={(isOpen) => setOpenPopovers(p => ({...p, [key]: isOpen}))}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-10 text-sm"
                    disabled={disabled || (!hasOptions && allHeaders.length > 0)}
                  >
                    <span className="truncate">
                      {selectedValue || (hasOptions ? placeholder : (allHeaders.length > 0 ? `No ${label} data` : 'Loading...'))}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder={`Search ${label}...`} />
                    <CommandList>
                      <CommandEmpty>No results found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setPendingDropdownFilters(prev => ({ ...prev, [key]: '' }));
                            setOpenPopovers(prev => ({ ...prev, [key]: false }));
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              !pendingDropdownFilters[key] ? "opacity-100" : "opacity-0"
                            )}
                          />
                          All
                        </CommandItem>
                        {currentUniqueValues.map(val => (
                          <CommandItem
                            key={val.value}
                            value={val.value}
                            onSelect={(currentValue) => {
                                setPendingDropdownFilters(prev => ({
                                    ...prev,
                                    [key]: prev[key] === currentValue ? '' : currentValue
                                }));
                                setOpenPopovers(prev => ({ ...prev, [key]: false }));
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                pendingDropdownFilters[key] === val.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {val.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
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
