import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ModelQualityItem } from '@/lib/zod-schemas';

interface ModelComparisonCardsProps {
  models: ModelQualityItem[];
}

export function ModelComparisonCards({ models }: ModelComparisonCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {models.map((model) => (
        <Card key={model.version}>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{model.name}</p>
              <Badge variant="outline" className="text-xs">
                {model.category}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Top-1 Accuracy</p>
                <p className="font-medium text-foreground">{(model.accuracy * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Top-3 Accuracy</p>
                <p className="font-medium text-foreground">
                  {model.top3_accuracy !== null ? `${(model.top3_accuracy * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Classes</p>
                <p className="font-medium text-foreground">{model.class_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Size</p>
                <p className="font-medium text-foreground">{(model.size_bytes / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Badge variant={model.quality_gates.accuracy_pass ? 'default' : 'destructive'} className="text-xs">
                Accuracy {model.quality_gates.accuracy_pass ? 'PASS' : 'FAIL'}
              </Badge>
              <Badge variant={model.quality_gates.size_pass ? 'default' : 'destructive'} className="text-xs">
                Size {model.quality_gates.size_pass ? 'PASS' : 'FAIL'}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">Trained {new Date(model.trained_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
