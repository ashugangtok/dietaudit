"use client";

import type React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GroupingOption, SummarizationOption, FilterOption, DietDataRow } from '@/types';
import { NUMERIC_COLUMNS } from '@/types';
import { Download, Filter, Layers, ListPlus, PlusCircle, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DataTableControlsProps {
  allHeaders: string[];
  groupings: GroupingOption[];
  setGroupings: (groupings: GroupingOption[]) => void;
  summaries: SummarizationOption[];
  setSummaries: (summaries: SummarizationOption[]) => void;
  filters: FilterOption[];
  setFilters: (filters: FilterOption[]) => void;
  processedData: DietDataRow[];
  currentColumns: string[];
}

const DataTableControls: React.FC<DataTableControlsProps> = ({
  allHeaders,
  groupings,
  setGroupings,
  summaries,
  setSummaries,
  filters,
  setFilters,
  processedData,
  currentColumns,
}) => {
  const availableGroupingHeaders = allHeaders.filter(h => !groupings.find(g => g.column === h));
  const availableSummaryHeaders = allHeaders.filter(h => NUMERIC_COLUMNS.includes(h as keyof DietDataRow) && !summaries.find(s => s.column === h));

  const addGrouping = (column: string) => {
    if (column && !groupings.find(g => g.column === column)) {
      setGroupings([...groupings, { column }]);
    }
  };

  const removeGrouping = (column: string) => {
    setGroupings(groupings.filter(g => g.column !== column));
  };

  const addSummary = (column: string, type: 'sum' | 'average' | 'count' = 'sum') => {
    if (column && !summaries.find(s => s.column === column)) {
      setSummaries([...summaries, { column, type }]);
    }
  };

  const updateSummaryType = (column: string, type: 'sum' | 'average' | 'count') => {
    setSummaries(summaries.map(s => s.column === column ? { ...s, type } : s));
  };

  const removeSummary = (column: string) => {
    setSummaries(summaries.filter(s => s.column !== column));
  };
  
  const addFilter = () => {
    if (allHeaders.length > 0) {
      setFilters([...filters, { column: allHeaders[0], value: '', type: 'contains' }]);
    }
  };

  const updateFilter = (index: number, newFilter: FilterOption) => {
    const newFilters = [...filters];
    newFilters[index] = newFilter;
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };


  const exportToCSV = () => {
    if (processedData.length === 0) {
      alert("No data to export.");
      return;
    }
    // Use currentColumns for headers to match displayed table
    const dataToExport = processedData.map(row => {
      const newRow: Record<string, any> = {};
      currentColumns.forEach(col => {
        newRow[col] = row[col];
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport, { header: currentColumns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, "DietWise_Export.xlsx");
  };

  return (
    <div className="space-y-6 p-4 bg-card rounded-lg shadow mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Grouping */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium flex items-center"><Layers className="mr-2 h-5 w-5 text-primary" /> Group By</h3>
          {groupings.map((group, index) => (
            <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
              <span className="flex-grow">{group.column}</span>
              <Button variant="ghost" size="icon" onClick={() => removeGrouping(group.column)} aria-label={`Remove grouping by ${group.column}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {availableGroupingHeaders.length > 0 && (
             <Select onValueChange={addGrouping} value="">
                <SelectTrigger className="w-full" aria-label="Add grouping column">
                    <SelectValue placeholder="Add grouping..." />
                </SelectTrigger>
                <SelectContent>
                    {availableGroupingHeaders.map(header => (
                    <SelectItem key={header} value={header}>{header}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          )}
        </div>

        {/* Summarization */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium flex items-center"><ListPlus className="mr-2 h-5 w-5 text-primary" /> Summarize</h3>
          {summaries.map((summary, index) => (
            <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
              <span className="flex-grow">{summary.column}</span>
              <Select value={summary.type} onValueChange={(type) => updateSummaryType(summary.column, type as 'sum'|'average'|'count')}>
                <SelectTrigger className="w-[100px]" aria-label={`Summarization type for ${summary.column}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeSummary(summary.column)} aria-label={`Remove summary for ${summary.column}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
           {availableSummaryHeaders.length > 0 && (
             <Select onValueChange={(val) => addSummary(val)} value="">
                <SelectTrigger className="w-full" aria-label="Add summary column">
                    <SelectValue placeholder="Add summary..." />
                </SelectTrigger>
                <SelectContent>
                    {availableSummaryHeaders.map(header => (
                    <SelectItem key={header} value={header}>{header}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          )}
        </div>

        {/* Filtering */}
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium flex items-center"><Filter className="mr-2 h-5 w-5 text-primary" /> Filters</h3>
                <Button variant="outline" size="sm" onClick={addFilter} disabled={allHeaders.length === 0}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Filter
                </Button>
            </div>
          {filters.map((filter, index) => (
            <div key={index} className="p-2 border rounded-md space-y-2">
              <div className="flex items-center gap-2">
                <Select value={filter.column} onValueChange={(col) => updateFilter(index, { ...filter, column: col })}>
                  <SelectTrigger className="flex-grow" aria-label={`Filter column ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allHeaders.map(header => (
                      <SelectItem key={header} value={header}>{header}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter.type} onValueChange={(type) => updateFilter(index, { ...filter, type: type as FilterOption['type'] })}>
                  <SelectTrigger className="w-[120px]" aria-label={`Filter type for column ${filter.column}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="in">In (comma sep.)</SelectItem>
                    {NUMERIC_COLUMNS.includes(filter.column as keyof DietDataRow) && <SelectItem value="range_number">Number Range</SelectItem>}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeFilter(index)} aria-label={`Remove filter ${index + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {filter.type === 'range_number' ? (
                <div className="flex gap-2">
                    <Input 
                        type="number" 
                        placeholder="Min" 
                        value={Array.isArray(filter.value) ? filter.value[0] || '' : ''}
                        onChange={(e) => updateFilter(index, {...filter, value: [parseFloat(e.target.value), (filter.value as any[])[1]]})}
                        className="w-1/2"
                        aria-label={`Minimum value for ${filter.column} filter`}
                    />
                    <Input 
                        type="number" 
                        placeholder="Max" 
                        value={Array.isArray(filter.value) ? filter.value[1] || '' : ''}
                        onChange={(e) => updateFilter(index, {...filter, value: [(filter.value as any[])[0], parseFloat(e.target.value)]})}
                        className="w-1/2"
                        aria-label={`Maximum value for ${filter.column} filter`}
                    />
                </div>
              ) : (
                <Input
                    value={Array.isArray(filter.value) ? filter.value.join(',') : filter.value as string}
                    onChange={(e) => updateFilter(index, { ...filter, value: filter.type === 'in' ? e.target.value.split(',') : e.target.value })}
                    placeholder={filter.type === 'in' ? 'value1,value2' : "Filter value"}
                    aria-label={`Filter value for ${filter.column}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-6 flex justify-end">
        <Button onClick={exportToCSV} disabled={processedData.length === 0} aria-label="Export data to CSV">
          <Download className="mr-2 h-4 w-4" /> Export to Excel
        </Button>
      </div>
    </div>
  );
};

export default DataTableControls;
