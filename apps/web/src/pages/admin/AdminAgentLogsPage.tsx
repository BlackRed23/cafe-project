import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle, Clock, Eye, Info, PauseCircle } from "lucide-react";
import { agentLogsApi } from "../../api/agentLogs.api";
import type { AgentLog, AgentLogsPagination, AgentLogStatus } from "../../types/agentLog.types";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";

const STATUS_META: Record<AgentLogStatus, { label: string; className: string; icon: React.ReactNode }> = {
  SUCCESS: {
    label: "Thành công",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <CheckCircle size={14} />,
  },
  SKIPPED: {
    label: "Bỏ qua",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <PauseCircle size={14} />,
  },
  FAILED: {
    label: "Thất bại",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    icon: <AlertCircle size={14} />,
  },
  RUNNING: {
    label: "Đang xử lý",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Clock size={14} />,
  },
};

const PAGE_SIZE = 20;
const LOW_PRIORITY_STOCK_REASONS = new Set(["STOCK_OK", "ABOVE_THRESHOLD"]);
type AgentLogFilter = "" | AgentLogStatus | "SIMULATION";
const DEFAULT_AGENT_LOG_MESSAGE = "Agent đã ghi nhận một sự kiện xử lý.";

const jsonBlock = (value: unknown) => JSON.stringify(value ?? null, null, 2);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const toTableMessage = (message: string) => {
  const firstReadableLine = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("at "));

  const text = firstReadableLine || message.trim();
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
};

const getAgentActionLabel = (log: AgentLog) => {
  const action = log.action;
  const result = log.result;
  const reason = log.reason;

  if (action === "SCAN_INVENTORY_CREATE_PURCHASE_REQUEST" || result === "CREATED_PURCHASE_REQUEST") {
    return "Tạo yêu cầu nhập hàng";
  }

  if (action === "SCAN_INVENTORY_SKIP_DUPLICATE" || reason === "ACTIVE_PR_EXISTS" || result === "SKIPPED_DUPLICATE") {
    return "Kiểm tra yêu cầu nhập hàng";
  }

  if (action === "SCAN_INVENTORY_NO_SUPPLIER" || action === "SCAN_INVENTORY_INACTIVE_SUPPLIER" || reason === "NO_SUPPLIER" || reason === "SUPPLIERS_INACTIVE") {
    return "Kiểm tra nhà cung cấp";
  }

  if (action === "SCAN_INVENTORY_DISABLED" || reason === "AI_DISABLED") {
    return "Kiểm tra cấu hình AI Agent";
  }

  if (action === "SCAN_INVENTORY_STOCK_OK" || reason === "STOCK_OK" || reason === "ABOVE_THRESHOLD") {
    return "Kiểm tra tồn kho";
  }

  if (action === "SCAN_INVENTORY_FAILED" || log.status === "FAILED") {
    return "Kiểm tra tồn kho thất bại";
  }

  if (action === "RECOMMEND_REORDER" || result === "RECOMMENDED") {
    return "Đề xuất nhập hàng";
  }

  if (action === "RECOMMEND_REORDER_SKIP" || action === "RECOMMEND_REORDER_SKIP_THRESHOLD") {
    return "Kiểm tra đề xuất nhập hàng";
  }

  if (action === "SEND_SUPPLIER_EMAIL") {
    return "Gửi email nhà cung cấp";
  }

  if (result === "CONVERTED_TO_PR") {
    return "Chuyển đề xuất thành yêu cầu nhập hàng";
  }

  return "Xử lý tồn kho";
};

const getAgentStatusLabel = (log: AgentLog) => {
  if (log.status === "SUCCESS" && log.result === "CREATED_PURCHASE_REQUEST") {
    return "Đã tạo yêu cầu nhập hàng";
  }

  if (log.status === "SKIPPED" && (log.reason === "ACTIVE_PR_EXISTS" || log.result === "SKIPPED_DUPLICATE")) {
    return "Bỏ qua tạo yêu cầu mới";
  }

  if (log.status === "SKIPPED" && (log.reason === "NO_SUPPLIER" || log.reason === "SUPPLIERS_INACTIVE" || log.result === "NO_SUPPLIER")) {
    return "Bỏ qua vì thiếu nhà cung cấp";
  }

  if (log.status === "SKIPPED" && log.reason === "AI_DISABLED") {
    return "Bỏ qua vì AI Agent đang tắt";
  }

  if (log.status === "SKIPPED" && (log.reason === "STOCK_OK" || log.reason === "ABOVE_THRESHOLD")) {
    return "Bỏ qua vì tồn kho an toàn";
  }

  if (log.status === "FAILED") {
    return "Xử lý thất bại";
  }

  if (log.status === "RUNNING") {
    return "Đang xử lý";
  }

  if (log.status === "SUCCESS") {
    return "Thành công";
  }

  return "Đã xử lý";
};

const getAgentFailureMessage = (log: AgentLog) => {
  const output = asRecord(log.output);
  const message = log.message?.trim() === DEFAULT_AGENT_LOG_MESSAGE ? undefined : log.message;
  const rawMessage = firstText(
    message,
    log.errorMessage,
    output.errorMessage,
    output.error,
    output.reason
  );

  if (rawMessage) {
    return toTableMessage(rawMessage);
  }

  if (log.reason === "DATABASE_ERROR") {
    return "AI Agent không thể xử lý do lỗi cơ sở dữ liệu.";
  }

  if (log.reason === "SERVER_ERROR") {
    return "AI Agent xử lý thất bại do lỗi hệ thống.";
  }

  if (log.reason === "INVALID_DATA") {
    return "AI Agent xử lý thất bại do dữ liệu đầu vào không hợp lệ.";
  }

  if (log.reason === "SMTP_ERROR") {
    return "Gửi email nhà cung cấp thất bại. Vui lòng kiểm tra cấu hình email.";
  }

  if (log.action === "SCAN_INVENTORY_FAILED") {
    return "AI Agent không thể kiểm tra tồn kho cho sản phẩm này.";
  }

  return "AI Agent xử lý thất bại. Vui lòng mở chi tiết để kiểm tra dữ liệu đầu vào và lỗi kỹ thuật.";
};

const getAgentDisplayMessage = (log: AgentLog) => {
  if (log.status === "FAILED") {
    return getAgentFailureMessage(log);
  }

  if (log.message?.trim()) return log.message.trim();

  if (log.status === "SUCCESS" && log.result === "CREATED_PURCHASE_REQUEST") {
    return "AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này.";
  }

  if (log.status === "SKIPPED" && (log.reason === "ACTIVE_PR_EXISTS" || log.result === "SKIPPED_DUPLICATE")) {
    return "Sản phẩm đã có yêu cầu nhập hàng chờ bạn xác nhận, nên AI Agent không tạo thêm yêu cầu mới.";
  }

  if (log.status === "SKIPPED" && (log.reason === "NO_SUPPLIER" || log.reason === "SUPPLIERS_INACTIVE" || log.result === "NO_SUPPLIER")) {
    return "Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.";
  }

  if (log.status === "SKIPPED" && log.reason === "AI_DISABLED") {
    return "Hệ thống đã phát hiện biến động tồn kho nhưng AI Agent đang bị tắt trong cấu hình.";
  }

  if (log.status === "SKIPPED" && (log.reason === "STOCK_OK" || log.reason === "ABOVE_THRESHOLD")) {
    return "Tồn kho hiện tại vẫn cao hơn ngưỡng cảnh báo.";
  }

  if (log.status === "RUNNING") {
    return "AI Agent đang xử lý tác vụ tồn kho.";
  }

  if (log.result === "RECOMMENDED") {
    return "AI Agent đã tạo đề xuất nhập hàng cho sản phẩm này.";
  }

  if (log.result === "CONVERTED_TO_PR") {
    return "Đề xuất nhập hàng đã được chuyển thành yêu cầu nhập hàng.";
  }

  return "AI Agent đã ghi nhận một sự kiện xử lý tồn kho.";
};

const STATUS_FILTER_LABEL: Record<AgentLogStatus, string> = {
  SUCCESS: "Thành công",
  SKIPPED: "Bỏ qua",
  FAILED: "Thất bại",
  RUNNING: "Đang xử lý",
};

const isLowPriorityStockLog = (log: AgentLog) =>
  [log.reason, log.result].some((value) => LOW_PRIORITY_STOCK_REASONS.has((value || "").toUpperCase()));

const shouldShowLowPriorityStockLog = (log: AgentLog, query: string, statusFilter: AgentLogFilter) => {
  if (!isLowPriorityStockLog(log)) return true;
  if (statusFilter) return true;
  if (!query) return false;

  return LOW_PRIORITY_STOCK_REASONS.has(query.toUpperCase());
};

const isSimulationAgentLog = (log: AgentLog) => {
  const input = asRecord(log.input);
  const output = asRecord(log.output);
  const values = [
    log.triggerType,
    log.sourceType,
    input.triggerType,
    input.sourceType,
    output.sourceType,
  ];

  if (values.some((value) => String(value || "").toUpperCase() === "SIMULATE_SALE")) return true;

  const text = [log.message, log.reasoning, input.note, output.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("simulate sale") || text.includes("mô phỏng") || text.includes("mo phong");
};

const getSimulationDedupeKey = (log: AgentLog) => {
  const timestamp = log.createdAt ? new Date(log.createdAt).getTime() : 0;
  const timeBucket = Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp / 10000) : 0;

  return [
    log.action,
    log.status,
    log.reason || log.result,
    log.productId,
    log.sourceId,
    timeBucket,
  ].join("|");
};

export const AdminAgentLogsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [pagination, setPagination] = useState<AgentLogsPagination | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentLogFilter>(
    searchParams.get("tab") === "simulation" ? "SIMULATION" : ""
  );
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AgentLog | null>(null);

  useEffect(() => {
    if (searchParams.get("tab") === "simulation" && statusFilter !== "SIMULATION") {
      setStatusFilter("SIMULATION");
      setPage(1);
    }
  }, [searchParams, statusFilter]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await agentLogsApi.getAgentLogsResponse({
          page,
          limit: PAGE_SIZE,
          status: statusFilter !== "SIMULATION" ? statusFilter || undefined : undefined,
          triggerType: statusFilter === "SIMULATION" ? "SIMULATE_SALE" : undefined,
        });
        setLogs(data.logs);
        setPagination(data.pagination);
      } catch {
        setError("Không thể tải nhật ký hoạt động AI Agent.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [page, statusFilter]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matchedLogs = logs.filter((log) => {
      if (statusFilter === "SIMULATION" && !isSimulationAgentLog(log)) return false;
      if (!shouldShowLowPriorityStockLog(log, query, statusFilter)) return false;
      if (!query) return true;

      return [
        getAgentActionLabel(log),
        getAgentStatusLabel(log),
        log.action,
        log.result,
        log.reason,
        log.message,
        log.triggerType,
        log.sourceType,
        log.sourceId,
        log.productName,
        log.productId,
        log.purchaseRequestId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    if (statusFilter !== "SIMULATION") return matchedLogs;

    const seen = new Set<string>();
    return matchedLogs.filter((log) => {
      const key = getSimulationDedupeKey(log);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [logs, search, statusFilter]);

  const handleStatusChange = (value: AgentLogFilter) => {
    setStatusFilter(value);
    setPage(1);
    setSearchParams(value === "SIMULATION" ? { tab: "simulation" } : {});
  };

  if (isLoading && logs.length === 0) {
    return <Loading message="Đang tải nhật ký hoạt động AI..." />;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo hành động, trạng thái, sản phẩm, nội dung..."
            className="w-full lg:max-w-md rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50"
          />

          <div className="flex flex-wrap items-center gap-2">
            {(["", "SUCCESS", "SKIPPED", "FAILED", "RUNNING", "SIMULATION"] as AgentLogFilter[]).map((status) => (
              <button
                key={status || "ALL"}
                onClick={() => handleStatusChange(status)}
                className={`px-3 py-2 rounded-xl border text-xs font-bold transition ${
                  statusFilter === status
                    ? "bg-amber-800 text-white border-amber-800"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {status === "SIMULATION" ? "Mô phỏng" : status ? STATUS_FILTER_LABEL[status] : "Tất cả"}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyState title="Nhật ký trống" description="Chưa ghi nhận hoạt động nào từ AI Agent." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-bold">Thời gian</th>
                  <th className="px-4 py-3 font-bold">Hành động</th>
                  <th className="px-4 py-3 font-bold">Trạng thái</th>
                  <th className="px-4 py-3 font-bold">Nội dung xử lý</th>
                  <th className="px-4 py-3 font-bold">Sản phẩm</th>
                  <th className="px-4 py-3 font-bold">Yêu cầu nhập hàng</th>
                  <th className="px-4 py-3 font-bold text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const meta = STATUS_META[log.status] || STATUS_META.SUCCESS;
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {log.createdAt ? formatDate(log.createdAt) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                          {getAgentActionLabel(log)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold ${meta.className}`}>
                          {meta.icon}
                          {getAgentStatusLabel(log)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-sm">
                        <span className="line-clamp-2">{getAgentDisplayMessage(log)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {log.productName || log.productId || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {log.purchaseRequestId ? (
                          <Link
                            to={`/admin/purchase-requests/${log.purchaseRequestId}`}
                            className="text-amber-800 font-bold hover:underline"
                          >
                            #{log.purchaseRequestId.slice(-8).toUpperCase()}
                          </Link>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                          title="Xem chi tiết kỹ thuật"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-500">
              Trang {pagination.page}/{pagination.totalPages} - {pagination.total} log
            </span>
            <div className="flex items-center gap-2">
              <Button disabled={page <= 1 || isLoading} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                Trước
              </Button>
              <Button
                disabled={page >= pagination.totalPages || isLoading}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Nhật ký kỹ thuật của AI Agent"
          size="lg"
        >
          <div className="space-y-5 text-sm">
            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-amber-800" /> Thông tin xử lý
              </h4>
              <p className="text-slate-800 font-semibold">{getAgentDisplayMessage(selectedLog)}</p>
              <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
                <span>Trạng thái kỹ thuật: <b>{selectedLog.status}</b></span>
                <span>Action kỹ thuật: <b>{selectedLog.action}</b></span>
                <span>Kết quả kỹ thuật: <b>{selectedLog.result || "-"}</b></span>
                <span>Lý do kỹ thuật: <b>{selectedLog.reason || "-"}</b></span>
                <span>Trigger type: <b>{selectedLog.triggerType || "-"}</b></span>
              </div>
            </div>

            {selectedLog.reasoning && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Lý giải kỹ thuật</span>
                <p className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-700 leading-relaxed">
                  {selectedLog.reasoning}
                </p>
              </div>
            )}

            {selectedLog.errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider">Lỗi xử lý:</span>
                <p className="font-mono text-xs">{selectedLog.errorMessage}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Dữ liệu đầu vào</span>
                <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                  {jsonBlock(selectedLog.input)}
                </pre>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Dữ liệu đầu ra</span>
                <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                  {jsonBlock(selectedLog.output)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">
              {selectedLog.purchaseRequestId && (
                <Link to={`/admin/purchase-requests/${selectedLog.purchaseRequestId}`}>
                  <Button>Xem yêu cầu nhập hàng</Button>
                </Link>
              )}
              {!selectedLog.purchaseRequestId && (
                <Link to="/admin/purchase-requests">
                  <Button>Xem danh sách yêu cầu nhập hàng</Button>
                </Link>
              )}
              <Button onClick={() => setSelectedLog(null)}>Đóng lại</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
