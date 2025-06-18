
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DietDataRow, FilterOption } from '@/types';
import { Filter, Clock, Sunrise, Sun, Sunset, Moon, CheckSquare } from 'lucide-react';

interface InteractiveFiltersProps {
  rawData: DietDataRow[];
  allHeaders: string[];
  filters: FilterOption[]; // These are the currently *applied* filters
  setFilters: (filters: FilterOption[]) => void; // This function applies the filters
}

type TimeOfDayFilterValue = 'all' | 'before6am' | '6to12' | '12to6' | 'after6pm';

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
  rawData,
  allHeaders,
  filters: appliedFilters, // Renamed for clarity within this component
  setFilters,
}) => {
  // Internal state for pending filter selections
  const [pendingDropdownFilters, setPendingDropdownFilters] = useState<Record<string, string>>({});
  const [pendingTimeOfDay, setPendingTimeOfDay] = useState<TimeOfDayFilterValue>('all');
  const [activeDateRange, setActiveDateRange] = useState<string>('1Day'); // UI only for now

  // Effect to initialize/synchronize pending filters with applied filters
  useEffect(() => {
    const initialDropdowns: Record<string, string> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      initialDropdowns[key] = 'all'; // Default to 'all'
    });
    let initialTimeOfDay: TimeOfDayFilterValue = 'all';

    appliedFilters.forEach(filter => {
      if (FILTERABLE_COLUMNS.some(fc => fc.key === filter.column) && filter.type === 'equals') {
        initialDropdowns[filter.column] = String(filter.value);
      } else if (filter.column === 'meal_start_time' && filter.type === 'timeOfDay') {
        initialTimeOfDay = filter.value as TimeOfDayFilterValue;
      }
    });
    setPendingDropdownFilters(initialDropdowns);
    setPendingTimeOfDay(initialTimeOfDay);
  }, [appliedFilters]);

  const uniqueValues = useMemo(() => {
    const uVals: Record<string, string[]> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      if (allHeaders.includes(key)) {
        const values = [...new Set(rawData.map(row => String(row[key] || '')).filter(val => val.trim() !== ''))].sort();
        uVals[key] = values;
      }
    });
    return uVals;
  }, [rawData, allHeaders]);

  const handlePendingDropdownChange = (column: string, value: string) => {
    setPendingDropdownFilters(prev => ({ ...prev, [column]: value }));
  };

  const handlePendingTimeOfDayChange = (timeRange: TimeOfDayFilterValue) => {
    setPendingTimeOfDay(timeRange);
  };

  const handleApplyFilters = useCallback(() => {
    const newFilters: FilterOption[] = [];
    Object.entries(pendingDropdownFilters).forEach(([column, value]) => {
      if (value !== 'all' && FILTERABLE_COLUMNS.some(fc => fc.key === column)) {
        newFilters.push({ column, value, type: 'equals' });
      }
    });
    if (pendingTimeOfDay !== 'all' && allHeaders.includes('meal_start_time')) {
      newFilters.push({ column: 'meal_start_time', value: pendingTimeOfDay, type: 'timeOfDay' });
    }
    setFilters(newFilters);
  }, [pendingDropdownFilters, pendingTimeOfDay, setFilters, allHeaders]);

  // Placeholder for date range filter - UI only for now
  const handleDateRangeChange = (range: string) => {
    setActiveDateRange(range);
  };

  return (
    <div className="p-4 bg-card rounded-lg shadow mb-6 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium flex items-center text-primary">
          <Filter className="mr-2 h-5 w-5" /> Filters & Date Range
        </h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {FILTERABLE_COLUMNS.map(({ key, label, placeholder }) => {
          if (!allHeaders.includes(key) && !uniqueValues[key]?.length) return null;
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</Label>
              <Select
                value={pendingDropdownFilters[key] || 'all'}
                onValueChange={(value) => handlePendingDropdownChange(key, value)}
                disabled={!uniqueValues[key] || uniqueValues[key].length === 0}
              >
                <SelectTrigger id={`filter-${key}`}>
                  <SelectValue placeholder={uniqueValues[key] && uniqueValues[key].length > 0 ? placeholder : `No ${label} data`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{placeholder}</SelectItem>
                  {uniqueValues[key]?.map(val => (
                    <SelectItem key={val} value={val}>{val}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div>
          <Label className="text-sm font-medium mb-2 block">Filter by Time of Day (Meal Start Time):</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'All Day', icon: Clock },
              { value: 'before6am', label: 'Before 6 AM', icon: Sunrise },
              { value: '6to12', label: '6 AM to 12 PM', icon: Sun },
              { value: '12to6', label: '12 PM to 6 PM', icon: Sunset },
              { value: 'after6pm', label: 'After 6 PM', icon: Moon },
            ].map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={pendingTimeOfDay === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePendingTimeOfDayChange(value as TimeOfDayFilterValue)}
                className="flex items-center gap-2"
                disabled={!allHeaders.includes('meal_start_time')}
              >
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
             {!allHeaders.includes('meal_start_time') && <p className="text-xs text-muted-foreground mt-1">Meal Start Time data not available for filtering.</p>}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">View Totals For:</Label>
           <div className="flex flex-wrap gap-2">
            {['1 Day', '7 Days', '15 Days', '30 Days'].map(range => (
              <Button
                key={range}
                variant={activeDateRange === range.replace(' ', '') ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDateRangeChange(range.replace(' ', ''))}
              >
                {range}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Detected input data duration: 1 day.</p>
          <p className="text-xs text-muted-foreground mt-1">Excluding Ingredients with Choice.</p>
        </div>
      </div>
      <div className="flex justify-end pt-4">
        <Button onClick={handleApplyFilters} size="lg">
          <CheckSquare className="mr-2 h-5 w-5" /> Apply Filters
        </Button>
      </div>
    </div>
  );
};

export default InteractiveFilters;
