/**
 * AI Logic (Backend)
 * 
 * This file handles AI-powered card generation and context-aware flashcard creation
 * using the OpenAI API.
 */

import { ipcMain } from 'electron';
import { OpenAI } from "openai";

// Initialize OpenAI client
const apiKey = process.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;

if (!apiKey) {
    console.error('Missing VITE_OPENAI_API_KEY environment variable in Main process.');
}

const openai = new OpenAI({
    apiKey: apiKey,
});

// ─────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────

interface GenerationOptions {
    cardFormat?: 'basic' | 'cloze' | 'reversed';
    difficulty?: 'essential' | 'detailed';
    customInstructions?: string;
}

function buildFormatRules(options: GenerationOptions): string {
    const format = options.cardFormat ?? 'basic';
    const difficulty = options.difficulty ?? 'detailed';

    const formatBlocks: Record<string, string> = {
        basic: [
            '- "front" should contain ONLY the question.',
            '- "back" should contain ONLY the answer.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
        cloze: [
            '- Generate Cloze Deletion cards.',
            '- "front" should contain the full sentence with the key term replaced by {{c1::term}}.',
            '- "back" should contain the complete sentence with the term visible.',
            '- Example: front: "The powerhouse of the cell is the {{c1::mitochondria}}.", back: "The powerhouse of the cell is the mitochondria."',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
        reversed: [
            '- For each concept, generate TWO cards: one forward and one reversed.',
            '- Card 1: "front" = question, "back" = answer.',
            '- Card 2: "front" = answer (rephrased as a question), "back" = original question.',
            '- Output JSON format: { "flashcards": [{ "front": "...", "back": "..." }] }',
        ].join('\n'),
    };

    const difficultyBlocks: Record<string, string> = {
        essential: '- Focus ONLY on the most important, high-yield concepts. Omit minor details.',
        detailed: '- Provide comprehensive, granular coverage of the material.',
    };

    let rules = formatBlocks[format] + '\n' + difficultyBlocks[difficulty];

    if (options.customInstructions?.trim()) {
        rules += `\n- Additional instructions from the user: ${options.customInstructions.trim()}`;
    }

    return rules;
}

// ─────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────

export const setupAIHandlers = () => {
    // Basic text-to-cards generation (Legacy)
    ipcMain.handle('generate-cards', async (_event, text: string, count: number = 5, language: string = 'English', options?: GenerationOptions) => {
        try {
            if (!apiKey) throw new Error('OpenAI API Key is missing.');

            const formatRules = buildFormatRules(options ?? {});

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: 'system',
                        content: `You are a flashcard creator. Generate ${count} flashcards from the given text in the ${language} language.

Rules:
${formatRules}
- Ensure all content is in ${language}.`,
                    },
                    { role: 'user', content: text },
                ],
                response_format: { type: 'json_object' },
            });
            const content = response.choices[0].message.content;
            const parsed = JSON.parse(content || '{}');
            return parsed.flashcards || parsed.cards || [];
        } catch (error) {
            console.error('Error generating cards:', error);
            throw error;
        }
    });

    // Advanced context-aware card generation
    ipcMain.handle('generate-cards-from-context', async (_event, { summary, content, count, language = 'English', options }: { summary: string, content: string, count: number, language?: string, options?: GenerationOptions }) => {
        try {
            if (!apiKey) throw new Error('OpenAI API Key is missing.');

            const formatRules = buildFormatRules(options ?? {});

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert flashcard generator. Create effective study cards.

Inputs:
- Context Summary: High-level overview to guide global understanding.
- Source Content: Full detailed text to extract specific Q&A.

Requirements:
- Generate ${count} flashcards.
- Order from Foundation (Basic definitions) -> Advanced (Application/Synthesis).
${formatRules}
- "front": Clear, specific content in ${language}.
- "back": Concise, accurate content in ${language}.
- Output language: ${language}. If source content is different, translate.`
                    },
                    {
                        role: 'user',
                        content: `SUMMARY:\n${summary}\n\nFULL SOURCE CONTENT:\n${content.substring(0, 50000)}`
                    }
                ],
                response_format: { type: 'json_object' },
            });

            const result = JSON.parse(response.choices[0].message.content || '{}');
            return result.flashcards || [];

        } catch (error) {
            console.error('Error generating cards from context:', error);
            throw error;
        }
    });
};

