
"use client";

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DietDataRow, FilterOption } from '@/types';
import { Filter, Clock, Sunrise, Sun, Sunset, Moon } from 'lucide-react';

interface InteractiveFiltersProps {
  rawData: DietDataRow[];
  allHeaders: string[];
  filters: FilterOption[];
  setFilters: (filters: FilterOption[]) => void;
}

type TimeOfDayFilterValue = 'all' | 'before6am' | '6to12' | '12to6' | 'after6pm';

const FILTERABLE_COLUMNS = [
  { key: 'site_name', label: 'Site Name', placeholder: 'All Sites' },
  { key: 'section_name', label: 'Section Name', placeholder: 'All Sections' },
  { key: 'user_enclosure_name', label: 'Enclosure Name', placeholder: 'All Enclosures' },
  { key: 'class_name', label: 'Class Name', placeholder: 'All Classes' },
  { key: 'common_name', label: 'Species Name (Common)', placeholder: 'All Species' },
];

const InteractiveFilters: React.FC<InteractiveFiltersProps> = ({
  rawData,
  allHeaders,
  filters,
  setFilters,
}) => {
  const [activeTimeOfDay, setActiveTimeOfDay] = useState<TimeOfDayFilterValue>('all');
  const [activeDateRange, setActiveDateRange] = useState<string>('1Day');

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

  const handleDropdownFilterChange = (column: string, value: string) => {
    const newFilters = filters.filter(f => f.column !== column);
    if (value !== 'all') {
      newFilters.push({ column, value, type: 'equals' });
    }
    setFilters(newFilters);
  };

  const handleTimeOfDayChange = (timeRange: TimeOfDayFilterValue) => {
    setActiveTimeOfDay(timeRange);
    const newFilters = filters.filter(f => f.column !== 'meal_start_time' || f.type !== 'timeOfDay');
    if (timeRange !== 'all') {
      newFilters.push({ column: 'meal_start_time', value: timeRange, type: 'timeOfDay' });
    }
    setFilters(newFilters);
  };
  
  // Placeholder for date range filter - UI only for now
  const handleDateRangeChange = (range: string) => {
    setActiveDateRange(range);
    // Actual date range filtering logic would be more complex and involve updating 'filters'
    // For now, this just updates the UI state.
  };

  useEffect(() => {
    // Initialize activeTimeOfDay based on existing filters if any
    const timeFilter = filters.find(f => f.column === 'meal_start_time' && f.type === 'timeOfDay');
    if (timeFilter) {
      setActiveTimeOfDay(timeFilter.value as TimeOfDayFilterValue);
    } else {
      setActiveTimeOfDay('all');
    }
  }, [filters]);


  return (
    <div className="p-4 bg-card rounded-lg shadow mb-6 space-y-6">
      <h3 className="text-lg font-medium flex items-center text-primary">
        <Filter className="mr-2 h-5 w-5" /> Filters & Date Range
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {FILTERABLE_COLUMNS.map(({ key, label, placeholder }) => {
          if (!allHeaders.includes(key)) return null;
          const currentFilterValue = filters.find(f => f.column === key)?.value || 'all';
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`filter-${key}`} className="text-sm font-medium">{label}</Label>
              <Select
                value={currentFilterValue as string}
                onValueChange={(value) => handleDropdownFilterChange(key, value)}
              >
                <SelectTrigger id={`filter-${key}`}>
                  <SelectValue placeholder={placeholder} />
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
          <Label className="text-sm font-medium mb-2 block">Filter by Time of Day:</Label>
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
                variant={activeTimeOfDay === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTimeOfDayChange(value as TimeOfDayFilterValue)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
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
    </div>
  );
};

export default InteractiveFilters;
