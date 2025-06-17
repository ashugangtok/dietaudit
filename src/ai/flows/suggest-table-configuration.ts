'use server';

/**
 * @fileOverview A flow that suggests optimal table configurations (groupings, summarizations, and filters) for an Excel file's data.
 *
 * - suggestTableConfiguration - A function that suggests the table configuration.
 * - SuggestTableConfigurationInput - The input type for the suggestTableConfiguration function.
 * - SuggestTableConfigurationOutput - The return type for the suggestTableConfiguration function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTableConfigurationInputSchema = z.object({
  excelData: z
    .string()
    .describe('The Excel file data as a string.'),
  columnHeaders: z.array(z.string()).describe('The column headers of the Excel file.'),
});
export type SuggestTableConfigurationInput = z.infer<
  typeof SuggestTableConfigurationInputSchema
>;

const SuggestTableConfigurationOutputSchema = z.object({
  groupingSuggestions: z
    .array(z.string())
    .describe('Suggested columns to group by.'),
  summarizationSuggestions: z
    .array(z.string())
    .describe('Suggested columns to summarize (e.g., sum, average).'),
  filterSuggestions: z
    .array(z.object({column: z.string(), type: z.string()}))
    .describe('Suggested columns to filter by and their filter types.'),
});
export type SuggestTableConfigurationOutput = z.infer<
  typeof SuggestTableConfigurationOutputSchema
>;

export async function suggestTableConfiguration(
  input: SuggestTableConfigurationInput
): Promise<SuggestTableConfigurationOutput> {
  return suggestTableConfigurationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestTableConfigurationPrompt',
  input: {schema: SuggestTableConfigurationInputSchema},
  output: {schema: SuggestTableConfigurationOutputSchema},
  prompt: `You are an AI assistant that analyzes Excel data and suggests optimal configurations for a pivot table.

Given the following Excel data and its column headers, provide suggestions for grouping, summarization, and filtering.

Excel Data:
{{{excelData}}}

Column Headers:
{{#each columnHeaders}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Grouping Suggestions: (List columns that would be useful to group by)

Summarization Suggestions: (List columns that would be useful to summarize and what operation to use, e.g. sum, average, count)

Filter Suggestions: (List columns that would be useful to filter by, along with a suggested filter type, e.g. categorical, numerical range)

Please provide your response as a JSON object conforming to the following schema:
${JSON.stringify(SuggestTableConfigurationOutputSchema.shape, null, 2)}`,
});

const suggestTableConfigurationFlow = ai.defineFlow(
  {
    name: 'suggestTableConfigurationFlow',
    inputSchema: SuggestTableConfigurationInputSchema,
    outputSchema: SuggestTableConfigurationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
