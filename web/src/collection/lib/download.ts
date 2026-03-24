/**
 * Trigger a browser download of a JSON string as a file.
 * Creates a temporary anchor element, clicks it, and cleans up.
 */
export function downloadJsonBlob(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
