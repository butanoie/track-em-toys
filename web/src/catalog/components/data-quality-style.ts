export function dataQualityStyle(quality: string): string {
  switch (quality) {
    case 'verified':
      return 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300';
    case 'community_verified':
      return 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300';
    default:
      return 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300';
  }
}
