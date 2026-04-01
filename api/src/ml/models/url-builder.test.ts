import { describe, it, expect } from 'vitest';
import { buildModelUrls } from './url-builder.js';

describe('buildModelUrls', () => {
  it('builds download and metadata URLs from base URL', () => {
    const urls = buildModelUrls('http://localhost:3010/ml/model-files', 'primary-v1.onnx', 'primary-v1-metadata.json');

    expect(urls.download_url).toBe('http://localhost:3010/ml/model-files/primary-v1.onnx');
    expect(urls.metadata_url).toBe('http://localhost:3010/ml/model-files/primary-v1-metadata.json');
  });

  it('returns null download_url when onnxFilename is null', () => {
    const urls = buildModelUrls('http://localhost:3010/ml/model-files', null, 'primary-v1-metadata.json');

    expect(urls.download_url).toBeNull();
    expect(urls.metadata_url).toBe('http://localhost:3010/ml/model-files/primary-v1-metadata.json');
  });

  it('strips trailing slashes from base URL', () => {
    const urls = buildModelUrls('https://cdn.example.com/models/', 'model.onnx', 'model-metadata.json');

    expect(urls.download_url).toBe('https://cdn.example.com/models/model.onnx');
    expect(urls.metadata_url).toBe('https://cdn.example.com/models/model-metadata.json');
  });

  it('handles CDN base URL', () => {
    const urls = buildModelUrls(
      'https://cdn.trackem.toys/ml/models',
      'secondary-classifier-20260331-c109-a86.3.onnx',
      'secondary-classifier-20260331-c109-a86.3-metadata.json'
    );

    expect(urls.download_url).toBe('https://cdn.trackem.toys/ml/models/secondary-classifier-20260331-c109-a86.3.onnx');
    expect(urls.metadata_url).toBe(
      'https://cdn.trackem.toys/ml/models/secondary-classifier-20260331-c109-a86.3-metadata.json'
    );
  });
});
