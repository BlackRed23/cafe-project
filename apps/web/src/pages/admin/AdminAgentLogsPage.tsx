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
const jsonBlock = (value: unknown) => JSON.stringify(value ?? null, null, 2);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const getAgentActionLabel = (log: AgentLog) => {
  const action = log.action;
  const result = log.result;
  const reason = log.reason;

  if (action === "SCAN_INVENTORY_CREATE_PURCHASE_REQUEST" || result === "CREATED_PURCHASE_REQUEST") {
    return "Tạo yêu cầu nhập hàng";
  }

  if (action === "SCAN_INVENTORY_SKIP_DUPLICATE" || reason === "ACTIVE_PR_EXISTS" || result === "SKIPPED_DUPLICATE" || reason === "EXISTING_PR_SUPPLIER_INACTIVE" || reason === "ACTIVE_PR_SUPPLIER_INACTIVE") {
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

  if (log.status === "SKIPPED" && (log.reason === "EXISTING_PR_SUPPLIER_INACTIVE" || log.reason === "ACTIVE_PR_SUPPLIER_INACTIVE")) {
    return "Bỏ qua cần xử lý";
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

const getReasonText = (code: string | undefined | null) => {
  if (!code) return "";
  switch (code) {
    case "DATABASE_ERROR": return "AI Agent không thể xử lý do lỗi cơ sở dữ liệu.";
    case "SERVER_ERROR": return "AI Agent xử lý thất bại do lỗi hệ thống.";
    case "INVALID_DATA": return "AI Agent xử lý thất bại do dữ liệu đầu vào không hợp lệ.";
    case "SMTP_ERROR": return "Gửi email nhà cung cấp thất bại. Vui lòng kiểm tra cấu hình email.";
    case "ACTIVE_PR_EXISTS": 
    case "SKIPPED_DUPLICATE": return "Sản phẩm đã có yêu cầu nhập hàng chờ bạn xác nhận, nên AI Agent không tạo thêm yêu cầu mới.";
    case "EXISTING_PR_SUPPLIER_INACTIVE":
    case "ACTIVE_PR_SUPPLIER_INACTIVE": return "Yêu cầu nhập hàng đang chờ xử lý nhưng nhà cung cấp đã bị tắt.";
    case "NO_SUPPLIER":
    case "SUPPLIERS_INACTIVE": return "Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.";
    case "AI_DISABLED": return "Hệ thống đã phát hiện biến động tồn kho nhưng AI Agent đang bị tắt trong cấu hình.";
    case "STOCK_OK":
    case "ABOVE_THRESHOLD": return "Tồn kho hiện tại vẫn cao hơn ngưỡng cảnh báo.";
    case "CREATED_PURCHASE_REQUEST": return "AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này.";
    case "RECOMMENDED": return "AI Agent đã tạo đề xuất nhập hàng cho sản phẩm này.";
    case "CONVERTED_TO_PR": return "Đề xuất nhập hàng đã được chuyển thành yêu cầu nhập hàng.";
    default: return "";
  }
};

export const getAgentLogDescription = (log: AgentLog): string => {
  const input = asRecord(log.input);
  const output = asRecord(log.output);

  const realMessage =
    log.description ||
    log.message ||
    output?.description ||
    output?.message ||
    output?.resultMessage ||
    input?.description ||
    input?.message ||
    getReasonText(log.reason || log.result || (output?.reason as string) || (output?.result as string));

  if (realMessage) {
    return String(realMessage);
  }

  if (log.status === "FAILED") {
    return "AI Agent xử lý thất bại. Vui lòng mở chi tiết để kiểm tra dữ liệu đầu vào và lỗi kỹ thuật.";
  }
  
  if (log.status === "RUNNING") {
    return "AI Agent đang xử lý tác vụ tồn kho.";
  }

  return "Agent đã ghi nhận một sự kiện xử lý.";
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

const isToday = (dateString?: string) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const isInventoryScanLog = (log: AgentLog) => {
  const triggerType = String(log.triggerType || "").toUpperCase();
  const action = String(log.action || "").toUpperCase();
  const reason = String(log.reason || "").toUpperCase();
  const result = String(log.result || "").toUpperCase();
  const message = String(log.message || "").toLowerCase();

  const inventoryTriggers = ["MANUAL_ADMIN_SCAN", "ORDER_COMPLETED", "SIMULATE_SALE", "INVENTORY_IMPORTED", "INVENTORY_ADJUSTED", "PURCHASE_RECEIVED"];
  if (inventoryTriggers.includes(triggerType)) return true;

  if (action.startsWith("SCAN_INVENTORY")) return true;

  if (["CREATED_PURCHASE_REQUEST", "ACTIVE_PR_EXISTS", "SKIPPED_DUPLICATE", "NO_SUPPLIER", "NO_SUPPLIERS_MAPPED", "SUPPLIERS_INACTIVE", "STOCK_OK", "ABOVE_THRESHOLD"].includes(result) || ["CREATED_PURCHASE_REQUEST", "ACTIVE_PR_EXISTS", "SKIPPED_DUPLICATE", "NO_SUPPLIER", "NO_SUPPLIERS_MAPPED", "SUPPLIERS_INACTIVE", "STOCK_OK", "ABOVE_THRESHOLD"].includes(reason)) return true;

  if (message.includes("tồn kho") || message.includes("inventory") || message.includes("nhập hàng")) return true;

  return false;
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
  const [showSessionLogs, setShowSessionLogs] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AgentLog | null>(null);

  const scanSessionIdParam = searchParams.get("scanSessionId") || "";
  const productIdParam = searchParams.get("productId") || "";
  const sourceIdParam = searchParams.get("sourceId") || "";
  const productNameParam = searchParams.get("productName") || "";

  const [summaryLogs, setSummaryLogs] = useState<AgentLog[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // Fetch summary logs once
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsSummaryLoading(true);
        const data = await agentLogsApi.getAgentLogsResponse({
          page: 1,
          limit: 100, // fetch up to 100 recent logs to build summary
        });
        setSummaryLogs(data.logs || []);
      } catch (err) {
        console.error("Lỗi tải log summary:", err);
      } finally {
        setIsSummaryLoading(false);
      }
    };
    fetchSummary();
  }, []);

  const scanSummary = useMemo(() => {
    const todayLogs = summaryLogs.filter(log => isToday(log.createdAt));
    const todayScanLogs = todayLogs.filter(isInventoryScanLog);

    const createdCount = todayScanLogs.filter(log =>
      log.result === "CREATED_PURCHASE_REQUEST" || log.action === "SCAN_INVENTORY_CREATE_PURCHASE_REQUEST" || (log.status === "SUCCESS" && log.result === "CREATED_PURCHASE_REQUEST")
    ).length;

    const duplicateCount = todayScanLogs.filter(log =>
      log.reason === "ACTIVE_PR_EXISTS" || log.result === "SKIPPED_DUPLICATE"
    ).length;

    const noSupplierCount = todayScanLogs.filter(log =>
      log.reason === "NO_SUPPLIER" || log.reason === "NO_SUPPLIERS_MAPPED" || log.reason === "SUPPLIERS_INACTIVE" || log.result === "NO_SUPPLIER"
    ).length;

    const failedCount = todayScanLogs.filter(log =>
      log.status === "FAILED" || log.result === "ERROR"
    ).length;

    // Group by scanSessionId if available, fallback to minute bucket
    const scanSessions = new Set<string>();
    todayScanLogs.forEach(log => {
      if (log.scanSessionId) {
        scanSessions.add(log.scanSessionId);
      } else {
        const sourceId = log.sourceId || (log.input as any)?.sourceId || (log.input as any)?.scanId || (log.input as any)?.requestId;
        if (sourceId) {
          scanSessions.add(`${log.triggerType || 'UNKNOWN'}-${sourceId}`);
        } else {
          const timestamp = log.createdAt ? new Date(log.createdAt).getTime() : 0;
          const minuteBucket = Math.floor(timestamp / 60000); // 1 minute window
          scanSessions.add(`${log.triggerType || 'UNKNOWN'}-${minuteBucket}`);
        }
      }
    });

    return {
      scanCount: scanSessions.size,
      totalLogs: todayScanLogs.length,
      createdCount,
      duplicateCount,
      noSupplierCount,
      failedCount,
      lastScanTime: todayScanLogs.length > 0 && todayScanLogs[0].createdAt ? formatDate(todayScanLogs[0].createdAt) : "Chưa có",
    };
  }, [summaryLogs]);

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
          productId: productIdParam || undefined,
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

    let paramFilteredLogs = matchedLogs;

    if (!showSessionLogs && !productIdParam) {
      paramFilteredLogs = paramFilteredLogs.filter(log => log.action !== "SCAN_INVENTORY_SESSION");
    }

    if (scanSessionIdParam || productIdParam || sourceIdParam) {
      const getLogProductId = (log: any) =>
        log.productId || log.input?.productId || log.output?.productId || log.product?.id || log.referenceProductId || "";
      const getLogProductName = (log: any) =>
        log.productName || log.input?.productName || log.output?.productName || log.product?.name || "";
      const getLogSourceId = (log: any) =>
        log.sourceId || log.input?.sourceId || log.output?.sourceId || "";
      const getLogScanSessionId = (log: any) =>
        log.scanSessionId || log.input?.scanSessionId || log.output?.scanSessionId || "";
      const isSessionSummary = (log: any) => log.action === "SCAN_INVENTORY_SESSION";

      let scopedLogs = paramFilteredLogs;

      if (productIdParam) {
        scopedLogs = scopedLogs.filter((log) => {
          if (isSessionSummary(log)) return false;
          return getLogProductId(log) === productIdParam || (productNameParam && getLogProductName(log) === productNameParam);
        });
      } else if (!showSessionLogs) {
        scopedLogs = scopedLogs.filter(log => !isSessionSummary(log));
      }

      if (scanSessionIdParam) {
        const bySession = scopedLogs.filter((log) => getLogScanSessionId(log) === scanSessionIdParam);
        if (bySession.length > 0 || !productIdParam) {
          scopedLogs = bySession;
        }
      }

      if (sourceIdParam) {
        const bySource = scopedLogs.filter((log) => getLogSourceId(log) === sourceIdParam);
        if (bySource.length > 0 || !productIdParam) {
          scopedLogs = bySource;
        }
      }

      paramFilteredLogs = scopedLogs;
    }

    if (statusFilter !== "SIMULATION") return paramFilteredLogs;

    const seen = new Set<string>();
    return paramFilteredLogs.filter((log) => {
      const key = getSimulationDedupeKey(log);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [logs, search, statusFilter, showSessionLogs, scanSessionIdParam, productIdParam, sourceIdParam, productNameParam]);

  const filterNote = useMemo(() => {
    if (!productIdParam || filteredLogs.length === 0) return null;
    const getLogSourceId = (log: any) => log.sourceId || log.input?.sourceId || log.output?.sourceId || "";
    const getLogScanSessionId = (log: any) => log.scanSessionId || log.input?.scanSessionId || log.output?.scanSessionId || "";

    if (sourceIdParam && !filteredLogs.some(log => getLogSourceId(log) === sourceIdParam)) {
      return "Không tìm thấy log theo sourceId, đang hiển thị nhật ký theo sản phẩm.";
    }
    if (scanSessionIdParam && !filteredLogs.some(log => getLogScanSessionId(log) === scanSessionIdParam)) {
      return "Không tìm thấy log theo phiên quét, đang hiển thị nhật ký theo sản phẩm.";
    }
    return null;
  }, [filteredLogs, productIdParam, sourceIdParam, scanSessionIdParam]);

  const handleStatusChange = (value: AgentLogFilter) => {
    setStatusFilter(value);
    setPage(1);
    
    // Giữ lại các param lọc
    const newParams = new URLSearchParams();
    if (value === "SIMULATION") newParams.set("tab", "simulation");
    if (scanSessionIdParam) newParams.set("scanSessionId", scanSessionIdParam);
    if (productIdParam) newParams.set("productId", productIdParam);
    if (sourceIdParam) newParams.set("sourceId", sourceIdParam);
    if (productNameParam) newParams.set("productName", productNameParam);
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
    setPage(1);
    setSearchParams(new URLSearchParams());
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

      {/* Daily Summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Tóm tắt quét tồn kho hôm nay</h2>
            <p className="text-xs text-slate-500 mt-1">
              Số lần quét được gom theo phiên quét trong log. Nếu log chưa có scanId, hệ thống gom theo trigger và thời điểm gần nhau. Tóm tắt dựa trên dữ liệu log đã tải.
            </p>
          </div>
          <select className="text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 px-3 py-1.5 outline-none min-w-[120px]">
            <option value="today">Hôm nay</option>
          </select>
        </div>

        {isSummaryLoading ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            <Loading message="Đang tải dữ liệu tóm tắt..." />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 flex flex-col">
              <span className="text-xs font-semibold text-indigo-600 uppercase">Số lần quét hôm nay</span>
              <div className="text-2xl font-bold text-indigo-700 mt-1">{scanSummary.scanCount}</div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/50 flex flex-col">
              <span className="text-xs font-semibold text-emerald-600 uppercase">Đã tạo yêu cầu</span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{scanSummary.createdCount}</div>
            </div>
            <div className="p-3 rounded-xl border border-amber-100 bg-amber-50/50 flex flex-col">
              <span className="text-xs font-semibold text-amber-600 uppercase">Đã có yêu cầu</span>
              <div className="text-2xl font-bold text-amber-700 mt-1">{scanSummary.duplicateCount}</div>
            </div>
            <div className="p-3 rounded-xl border border-orange-100 bg-orange-50/50 flex flex-col">
              <span className="text-xs font-semibold text-orange-600 uppercase">Thiếu nhà cung cấp</span>
              <div className="text-2xl font-bold text-orange-700 mt-1">{scanSummary.noSupplierCount}</div>
            </div>
            <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/50 flex flex-col">
              <span className="text-xs font-semibold text-rose-600 uppercase">Lỗi Agent</span>
              <div className="text-2xl font-bold text-rose-700 mt-1">{scanSummary.failedCount}</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase">Log phát sinh</span>
              <div className="text-2xl font-bold text-slate-700 mt-1">{scanSummary.totalLogs}</div>
            </div>
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex flex-col lg:col-span-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Lần quét gần nhất</span>
              <div className="text-xl font-bold text-slate-700 mt-1 flex h-full items-center">
                {scanSummary.lastScanTime}
              </div>
            </div>
          </div>
        )}
      </div>

      {(scanSessionIdParam || productIdParam || sourceIdParam) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-col gap-1 text-sm text-blue-800">
            <div className="flex items-center gap-2">
              <Info size={18} className="text-blue-600 shrink-0" />
              {productNameParam ? (
                <span className="font-semibold block sm:inline">Đang xem Nhật ký Agent của sản phẩm: {productNameParam}</span>
              ) : productIdParam ? (
                <span className="font-semibold block sm:inline">Đang lọc theo sản phẩm: {productIdParam}</span>
              ) : null}
            </div>
            {scanSessionIdParam && (
              <div className="flex items-center gap-2 pl-[26px]">
                <span className="font-semibold block sm:inline">Phiên quét: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-100">{scanSessionIdParam}</span></span>
              </div>
            )}
            {filterNote && (
              <div className="flex items-center gap-2 pl-[26px] mt-1 text-xs text-amber-600 font-medium">
                {filterNote}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" className="bg-white border-blue-200 text-blue-700 hover:bg-blue-100 shrink-0" onClick={clearFilters}>
            Xóa bộ lọc
          </Button>
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
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button
              onClick={() => setShowSessionLogs(!showSessionLogs)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                showSessionLogs
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Phiên quét
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          productIdParam ? (
            <EmptyState title="Không tìm thấy nhật ký" description="Không tìm thấy nhật ký Agent của sản phẩm này." />
          ) : (scanSessionIdParam || sourceIdParam) ? (
            <EmptyState title="Không tìm thấy nhật ký" description="Không tìm thấy nhật ký xử lý theo điều kiện lọc hiện tại." />
          ) : (
            <EmptyState title="Nhật ký trống" description="Chưa ghi nhận hoạt động nào từ AI Agent." />
          )
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
                        <span className="line-clamp-2">{getAgentLogDescription(log)}</span>
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
          title={selectedLog.action === "SCAN_INVENTORY_SESSION" ? "Nhật ký phiên quét AI Agent" : "Nhật ký xử lý sản phẩm của AI Agent"}
          size="lg"
        >
          <div className="space-y-5 text-sm">
            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-amber-800" /> Thông tin xử lý
              </h4>
              <p className="text-slate-800 font-semibold">{getAgentLogDescription(selectedLog)}</p>
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
