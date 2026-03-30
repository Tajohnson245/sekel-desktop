/**
 * Plan export service — writes an archived plan as a JSON file to the user's device.
 * Files are saved to: userData/archived-plans/plan-{slug}-{date}.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { Plan } from '../db/planService';

export function getArchivedPlansDir(): string {
    return path.join(app.getPath('userData'), 'archived-plans');
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
}

/**
 * Writes the plan as a JSON file to the archived-plans directory in userData.
 * @returns The absolute path of the saved file.
 */
export function exportPlanToFile(plan: Plan): string {
    const dir = getArchivedPlansDir();
    fs.mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const slug = slugify(plan.name);
    const filename = `plan-${slug}-${date}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf-8');
    return filePath;
}
