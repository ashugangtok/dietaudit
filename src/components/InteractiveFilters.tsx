
"use client";

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DietDataRow, FilterOption, GroupingOption, SummarizationOption } from '@/types';
import { Filter, CheckSquare, Layers3, ListOrdered, PlusCircle, Trash2 } from 'lucide-react';
import { NUMERIC_COLUMNS } from '@/types';
import { Input } from './ui/input';


interface InteractiveFiltersProps {
  rawData: DietDataRow[];
  allHeaders: string[];
  appliedFilters: FilterOption[]; 
  onApplyFilters: (filters: FilterOption[]) => void;
  disabled?: boolean;
  groupings: GroupingOption[];
  setGroupings: (groupings: GroupingOption[]) => void;
  summaries: SummarizationOption[];
  setSummaries: (summaries: SummarizationOption[]) => void;

}

const FILTERABLE_COLUMNS = [
  { key: 'site_name', label: 'Site Name', placeholder: 'All Sites' },
  { key: 'section_name', label: 'Section Name', placeholder: 'All Sections' },
  { key: 'user_enclosure_name', label: 'Enclosure Name', placeholder: 'All Enclosures' },
  { key: 'group_name', label: 'Group Name', placeholder: 'All Groups' },
  { key: 'common_name', label: 'Species Name (Common)', placeholder: 'All Species' },
  { key: 'diet_name', label: 'Diet Name', placeholder: 'All Diets' },
  { key: 'class_name', label: 'Class Name', placeholder: 'All Classes'},
  // Can add more general filterable columns here if needed
];

const InteractiveFilters: React.FC<InteractiveFiltersProps> = ({
  rawData, 
  allHeaders, 
  appliedFilters, 
  onApplyFilters,
  disabled = false,
  groupings,
  setGroupings,
  summaries,
  setSummaries,
}) => {
  const [pendingDropdownFilters, setPendingDropdownFilters] = useState<Record<string, string>>({});
  const [localFilters, setLocalFilters] = useState<FilterOption[]>([]); // For advanced filter inputs

  // Sync pendingDropdownFilters with appliedFilters on initial load or when appliedFilters change externally
  useEffect(() => {
    const initialDropdowns: Record<string, string> = {};
    FILTERABLE_COLUMNS.forEach(({ key }) => {
      initialDropdowns[key] = 'all'; 
    });
    
    const advancedFiltersFromApplied: FilterOption[] = [];

    appliedFilters.forEach(filter => {
      const isDropdownManaged = FILTERABLE_COLUMNS.some(fc => fc.key === filter.column);
      if (isDropdownManaged && filter.type === 'equals') {
        initialDropdowns[filter.column] = String(filter.value);
      } else if (!isDropdownManaged) {
        advancedFiltersFromApplied.push(filter);
      }
    });
    setPendingDropdownFilters(initialDropdowns);
    setLocalFilters(advancedFiltersFromApplied);
  }, [appliedFilters]);


  const uniqueValues = useMemo(() => {
    const uVals: Record<string, string[]> = {};
    if (allHeaders.length > 0 && rawData.length > 0) { 
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
    const newCombinedFilters: FilterOption[] = [...localFilters]; // Start with advanced filters
    Object.entries(pendingDropdownFilters).forEach(([column, value]) => {
      if (value !== 'all' && FILTERABLE_COLUMNS.some(fc => fc.key === column)) {
        // Avoid adding duplicate if an advanced filter for the same column exists (though type might differ)
        if (!newCombinedFilters.some(f => f.column === column)) {
             newCombinedFilters.push({ column, value, type: 'equals' });
        }
      }
    });
    onApplyFilters(newCombinedFilters);
  }, [pendingDropdownFilters, localFilters, onApplyFilters, disabled]);

  // Grouping and Summarization handlers
  const availableGroupingHeaders = useMemo(() => allHeaders.filter(h => !groupings.find(g => g.column === h)), [allHeaders, groupings]);
  const availableSummaryHeaders = useMemo(() => allHeaders.filter(h => !summaries.find(s => s.column === h)), [allHeaders, summaries]);


  const addGrouping = (column: string) => {
    if (column && !groupings.find(g => g.column === column)) {
      setGroupings([...groupings, { column }]);
    }
  };
  const removeGrouping = (column: string) => setGroupings(groupings.filter(g => g.column !== column));

  const addSummary = (column: string, type: SummarizationOption['type'] = 'sum') => {
    if (column && !summaries.find(s => s.column === column)) {
      setSummaries([...summaries, { column, type }]);
    }
  };
  const updateSummaryType = (column: string, type: SummarizationOption['type']) => {
    setSummaries(summaries.map(s => s.column === column ? { ...s, type } : s));
  };
  const removeSummary = (column: string) => setSummaries(summaries.filter(s => s.column !== column));

  // Advanced Filter Handlers
    const addAdvancedFilter = () => {
        if (allHeaders.length > 0) {
        setLocalFilters([...localFilters, { column: allHeaders[0], value: '', type: 'contains' }]);
        }
    };

    const updateAdvancedFilter = (index: number, newFilter: FilterOption) => {
        const newFilters = [...localFilters];
        newFilters[index] = newFilter;
        setLocalFilters(newFilters);
    };

    const removeAdvancedFilter = (index: number) => {
        setLocalFilters(localFilters.filter((_, i) => i !== index));
    };


  return (
    <div className="p-4 bg-card rounded-lg shadow mb-6 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium flex items-center text-primary">
          <Filter className="mr-2 h-5 w-5" /> Interactive Configuration
        </h3>
      </div>
      
      {allHeaders.length === 0 && !disabled && (
         <p className="text-sm text-muted-foreground">
            Select a file and click "Apply Configuration" once to populate filter options based on your data.
          </p>
      )}

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Grouping */}
        <div className="space-y-2 p-3 border rounded-md bg-background/50">
          <h4 className="text-md font-semibold flex items-center"><Layers3 className="mr-2 h-5 w-5 text-accent" /> Group By</h4>
          {groupings.map((group, index) => (
            <div key={`group-${index}`} className="flex items-center gap-2 p-1.5 border border-dashed rounded-md text-sm">
              <span className="flex-grow truncate" title={group.column}>{group.column}</span>
              <Button variant="ghost" size="icon" onClick={() => removeGrouping(group.column)} aria-label={`Remove grouping by ${group.column}`} className="h-6 w-6">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {availableGroupingHeaders.length > 0 && (
             <Select onValueChange={addGrouping} value="">
                <SelectTrigger className="w-full h-9 text-sm" aria-label="Add grouping column" disabled={disabled}>
                    <SelectValue placeholder="Add grouping..." />
                </SelectTrigger>
                <SelectContent>
                    {availableGroupingHeaders.map(header => (
                    <SelectItem key={header} value={header} className="text-sm">{header}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          )}
        </div>

        {/* Summarization */}
        <div className="space-y-2 p-3 border rounded-md bg-background/50">
          <h4 className="text-md font-semibold flex items-center"><ListOrdered className="mr-2 h-5 w-5 text-accent" /> Summarize</h4>
          {summaries.map((summary, index) => (
            <div key={`summary-${index}`} className="flex items-center gap-2 p-1.5 border border-dashed rounded-md text-sm">
              <span className="flex-grow truncate" title={summary.column}>{summary.column}</span>
              <Select value={summary.type} onValueChange={(type) => updateSummaryType(summary.column, type as SummarizationOption['type'])} disabled={disabled}>
                <SelectTrigger className="w-[100px] h-8 text-xs" aria-label={`Summarization type for ${summary.column}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum" className="text-xs">Sum</SelectItem>
                  <SelectItem value="average" className="text-xs">Average</SelectItem>
                  <SelectItem value="count" className="text-xs">Count</SelectItem>
                  <SelectItem value="first" className="text-xs">First</SelectItem>
                  <SelectItem value="max" className="text-xs">Max</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeSummary(summary.column)} aria-label={`Remove summary for ${summary.column}`} className="h-6 w-6">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
           {availableSummaryHeaders.length > 0 && (
             <Select onValueChange={(val) => addSummary(val)} value="" disabled={disabled}>
                <SelectTrigger className="w-full h-9 text-sm" aria-label="Add summary column">
                    <SelectValue placeholder="Add summary..." />
                </SelectTrigger>
                <SelectContent>
                    {availableSummaryHeaders.filter(h => NUMERIC_COLUMNS.includes(h as keyof DietDataRow) || h === 'base_uom_name').map(header => ( // Allow base_uom_name for 'first'
                    <SelectItem key={header} value={header} className="text-sm">{header}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          )}
        </div>
        
        {/* Quick Filters (Dropdowns) */}
        <div className="space-y-4 p-3 border rounded-md bg-background/50 md:col-span-2 lg:col-span-1 lg:row-span-2">
             <h4 className="text-md font-semibold flex items-center"><Filter className="mr-2 h-5 w-5 text-accent" /> Quick Filters</h4>
            {FILTERABLE_COLUMNS.map(({ key, label, placeholder }) => {
            if (allHeaders.length === 0 && !Object.keys(uniqueValues).includes(key)) {
                return (
                    <div key={key} className="space-y-1">
                    <Label htmlFor={`filter-${key}`} className="text-xs font-medium text-muted-foreground/70">{label}</Label>
                    <Select disabled={true}>
                        <SelectTrigger id={`filter-${key}`} className="h-9 text-sm">
                        <SelectValue placeholder={`Loading...`} />
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
                <Label htmlFor={`filter-${key}`} className="text-xs font-medium">{label}</Label>
                <Select
                    value={pendingDropdownFilters[key] || 'all'}
                    onValueChange={(value) => handlePendingDropdownChange(key, value)}
                    disabled={disabled || !hasOptions && allHeaders.length > 0}
                >
                    <SelectTrigger id={`filter-${key}`} className="h-9 text-sm">
                    <SelectValue placeholder={hasOptions ? placeholder : (allHeaders.length > 0 ? `No ${label} data` : `Loading...`)} />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all" className="text-sm">{placeholder}</SelectItem>
                    {currentUniqueValues?.map(val => (
                        <SelectItem key={val} value={val} className="text-sm">{val}</SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                </div>
            );
            })}
        </div>
        
        {/* Advanced Filters */}
        <div className="space-y-3 p-3 border rounded-md bg-background/50 md:col-span-3 lg:col-span-2">
            <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold flex items-center"><Filter className="mr-2 h-5 w-5 text-accent" /> Advanced Filters</h4>
                <Button variant="outline" size="sm" onClick={addAdvancedFilter} disabled={disabled || allHeaders.length === 0} className="h-8 text-xs">
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Advanced Filter
                </Button>
            </div>
            {localFilters.map((filter, index) => (
                <div key={`advanced-filter-${index}`} className="p-2 border border-dashed rounded-md space-y-2">
                <div className="flex items-center gap-2">
                    <Select value={filter.column} onValueChange={(col) => updateAdvancedFilter(index, { ...filter, column: col, value: '' })} disabled={disabled}>
                    <SelectTrigger className="flex-grow h-8 text-xs" aria-label={`Advanced filter column ${index + 1}`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {allHeaders.map(header => (
                        <SelectItem key={header} value={header} className="text-xs">{header}</SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                    <Select value={filter.type} onValueChange={(type) => updateAdvancedFilter(index, { ...filter, type: type as FilterOption['type'], value: type === 'range_number' ? [undefined, undefined] : '' })} disabled={disabled}>
                    <SelectTrigger className="w-[110px] h-8 text-xs" aria-label={`Advanced filter type for column ${filter.column}`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="contains" className="text-xs">Contains</SelectItem>
                        <SelectItem value="equals" className="text-xs">Equals</SelectItem>
                        <SelectItem value="in" className="text-xs">In (comma sep.)</SelectItem>
                        {NUMERIC_COLUMNS.includes(filter.column as keyof DietDataRow) && <SelectItem value="range_number" className="text-xs">Number Range</SelectItem>}
                    </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => removeAdvancedFilter(index)} aria-label={`Remove advanced filter ${index + 1}`} className="h-6 w-6">
                    <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
                {filter.type === 'range_number' ? (
                    <div className="flex gap-2">
                        <Input 
                            type="number" 
                            placeholder="Min" 
                            value={Array.isArray(filter.value) && filter.value[0] !== undefined ? filter.value[0] : ''}
                            onChange={(e) => updateAdvancedFilter(index, {...filter, value: [e.target.value === '' ? undefined : parseFloat(e.target.value), (filter.value as any[])[1]]})}
                            className="w-1/2 h-8 text-xs"
                            aria-label={`Minimum value for ${filter.column} filter`}
                            disabled={disabled}
                        />
                        <Input 
                            type="number" 
                            placeholder="Max" 
                            value={Array.isArray(filter.value) && filter.value[1] !== undefined ? filter.value[1] : ''}
                            onChange={(e) => updateAdvancedFilter(index, {...filter, value: [(filter.value as any[])[0], e.target.value === '' ? undefined : parseFloat(e.target.value)]})}
                            className="w-1/2 h-8 text-xs"
                            aria-label={`Maximum value for ${filter.column} filter`}
                            disabled={disabled}
                        />
                    </div>
                ) : (
                    <Input
                        value={Array.isArray(filter.value) ? filter.value.join(',') : filter.value as string}
                        onChange={(e) => updateAdvancedFilter(index, { ...filter, value: filter.type === 'in' ? e.target.value.split(',').map(s=>s.trim()).filter(s=>s) : e.target.value })}
                        placeholder={filter.type === 'in' ? 'value1,value2' : "Filter value"}
                        aria-label={`Advanced filter value for ${filter.column}`}
                        className="h-8 text-xs"
                        disabled={disabled}
                    />
                )}
                </div>
            ))}
             {localFilters.length === 0 && allHeaders.length > 0 && <p className="text-xs text-muted-foreground text-center py-2">No advanced filters added.</p>}
        </div>

    </div>


      <div className="flex justify-end pt-4">
        <Button onClick={handleApplyFiltersInternal} size="lg" disabled={disabled}>
          <CheckSquare className="mr-2 h-5 w-5" /> Apply Configuration
        </Button>
      </div>
    </div>
  );
};

export default InteractiveFilters;

