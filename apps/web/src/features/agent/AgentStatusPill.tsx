import { runStatusLabel, statusTone, toolStatusLabel } from './agentWorkspace.presentation';

export function AgentStatusPill({ status, type = 'run' }: { status: string | null; type?: 'run' | 'tool' | 'audit' }) {
  const label = type === 'tool' ? toolStatusLabel(status || '') :
    type === 'audit' ? ({ SUCCESS: 'Thành công', FAILED: 'Thất bại', SKIPPED: 'Bỏ qua',
      RUNNING: 'Đang xử lý' } as Record<string, string>)[status || ''] || 'Không có dữ liệu' :
    runStatusLabel(status);
  return <span className="agent-status" data-tone={statusTone(status)}>{label}</span>;
}
