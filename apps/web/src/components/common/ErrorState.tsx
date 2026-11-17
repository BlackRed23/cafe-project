import { Alert } from './Alert';
import { Button } from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Alert tone="danger" title="Không thể tải dữ liệu">
      <p>{message}</p>
      {onRetry && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>Thử lại</Button>}
    </Alert>
  );
}
