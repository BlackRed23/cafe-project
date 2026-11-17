import type { ReactNode } from 'react';

interface AlertProps {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
}

export function Alert({ children, tone = 'info', title }: AlertProps) {
  return (
    <div className="ds-alert" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
