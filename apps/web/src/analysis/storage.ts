import type { AnalysisRun } from './types';

const LAST_ANALYSIS_KEY = 'prophylens:last-analysis:v1';

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function saveLastAnalysis(run: AnalysisRun): void {
  localStorage.setItem(LAST_ANALYSIS_KEY, JSON.stringify(run));
}

export function downloadAnalysis(run: AnalysisRun): void {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prophylens-analysis-${run.createdAt.replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
