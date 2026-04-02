import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ModelComparisonCards } from './ModelComparisonCards';
import { PerClassAccuracyChart } from './PerClassAccuracyChart';
import { ConfusedPairsTable } from './ConfusedPairsTable';
import type { MlModelQuality } from '@/lib/zod-schemas';

interface ModelQualitySectionProps {
  data: MlModelQuality | undefined;
  isPending: boolean;
}

export function ModelQualitySection({ data, isPending }: ModelQualitySectionProps) {
  if (isPending) {
    return <LoadingSpinner className="py-8" />;
  }

  if (!data || data.models.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Model Quality</h2>

      <ModelComparisonCards models={data.models} />

      {data.models.map((model) => (
        <div key={model.version} className="space-y-4">
          {data.models.length > 1 && (
            <h3 className="text-sm font-medium text-muted-foreground">{model.name} ({model.category})</h3>
          )}

          {!model.metrics_available && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Metrics file not found for this model. Run training to generate per-class accuracy data.
            </p>
          )}

          {model.per_class_accuracy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-Class Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <PerClassAccuracyChart items={model.per_class_accuracy} />
              </CardContent>
            </Card>
          )}

          {model.confused_pairs && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Confused Pairs</CardTitle>
              </CardHeader>
              <CardContent>
                <ConfusedPairsTable pairs={model.confused_pairs} />
              </CardContent>
            </Card>
          )}
        </div>
      ))}
    </section>
  );
}
