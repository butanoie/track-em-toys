export interface ModelUrls {
  download_url: string | null;
  metadata_url: string;
}

/**
 * Build download and metadata URLs for a model.
 *
 * @param baseUrl - Base URL for model file serving (no trailing slash)
 * @param onnxFilename - ONNX model filename, or null if not yet exported
 * @param metadataFilename - Metadata JSON filename
 */
export function buildModelUrls(baseUrl: string, onnxFilename: string | null, metadataFilename: string): ModelUrls {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    download_url: onnxFilename ? `${base}/${onnxFilename}` : null,
    metadata_url: `${base}/${metadataFilename}`,
  };
}
