import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { agentLogsApi } from "../../api/agentLogs.api";
import type { AgentLog } from "../../types/agentLog.types";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { DataTable } from "../../components/admin/DataTable";
import { Eye, AlertCircle, CheckCircle, Info } from "lucide-react";

export const AdminAgentLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Detail Modal states
  const [selectedLog, setSelectedLog] = useState<AgentLog | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true);
        const data = await agentLogsApi.getAgentLogs();
        // Sort logs newest first
        const sorted = data.sort((a, b) => {
          const t1 = a.createdAt || a.created_at || "";
          const t2 = b.createdAt || b.created_at || "";
          return new Date(t2).getTime() - new Date(t1).getTime();
        });
        setLogs(sorted);
      } catch (err: any) {
        setError("Không thể tải nhật ký hoạt động AI Agent.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (isLoading) {
    return <Loading message="Đang tải nhật ký hoạt động AI..." />;
  }

  const filteredLogs = logs.filter((log) => {
    const pName = log.product?.name || "";
    const action = log.action || "";
    const query = search.toLowerCase();
    return pName.toLowerCase().includes(query) || action.toLowerCase().includes(query);
  });

  const columns = [
    {
      header: "Thời gian",
      render: (log: AgentLog) => {
        const dateStr = log.createdAt || log.created_at || "";
        return <span className="text-slate-500 font-light">{dateStr ? formatDate(dateStr) : ""}</span>;
      },
    },
    {
      header: "Sản phẩm quét",
      render: (log: AgentLog) => <span className="font-semibold text-slate-800">{log.product?.name || "—"}</span>,
    },
    {
      header: "Hành động",
      render: (log: AgentLog) => (
        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs">
          {log.action || "CHECK_STOCK"}
        </span>
      ),
    },
    {
      header: "Trạng thái xử lý",
      render: (log: AgentLog) => {
        const statusStr = (log.status || "").toUpperCase();
        const isErr = statusStr === "ERROR" || statusStr === "FAILED" || !!log.error || !!log.error_message;
        return isErr ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
            <AlertCircle size={14} /> Thất bại
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle size={14} /> Thành công
          </span>
        );
      },
    },
    {
      header: "Purchase Request",
      render: (log: AgentLog) => {
        const prId = log.purchaseRequestId || log.purchase_request_id || "";
        return prId ? (
          <Link
            to={`/admin/purchase-requests/${prId}`}
            className="text-amber-800 font-bold hover:text-amber-900 hover:underline"
          >
            #{prId.slice(-8).toUpperCase()}
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      header: "Chi tiết",
      className: "text-right",
      render: (log: AgentLog) => (
        <button
          onClick={() => setSelectedLog(log)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          title="Xem chi tiết kỹ thuật"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {logs.length === 0 ? (
        <EmptyState title="Nhật ký trống" description="Chưa ghi nhận hoạt động nào từ AI Agent." />
      ) : (
        <DataTable
          columns={columns}
          data={filteredLogs}
          searchPlaceholder="Tìm theo sản phẩm hoặc hành động..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      {/* JSON Debugger Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Nhật ký kỹ thuật của AI Agent"
          size="lg"
        >
          <div className="space-y-5 text-sm">
            {/* Reasoning text */}
            <div className="bg-amber-50/50 border border-amber-200/50 p-4.5 rounded-xl space-y-1.5">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-amber-800" /> Reasoning / Chuỗi suy nghĩ
              </h4>
              <p className="text-slate-650 font-light leading-relaxed">
                {selectedLog.reasoning || "AI Agent thực hiện kiểm tra so sánh lượng tồn kho thực tế so với ngưỡng cảnh báo tối thiểu."}
              </p>
            </div>

            {selectedLog.errorMessage || selectedLog.error || selectedLog.error_message ? (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider">Thông báo lỗi (Error):</span>
                <p className="font-mono text-xs">{selectedLog.errorMessage || selectedLog.error || selectedLog.error_message}</p>
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Input payload JSON */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Dữ liệu đầu vào (Input)</span>
                <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto max-h-52 overflow-y-auto">
                  {JSON.stringify(selectedLog.input || { productId: selectedLog.product?.id || "N/A" }, null, 2)}
                </pre>
              </div>

              {/* Output response JSON */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Kết quả đầu ra (Output)</span>
                <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl overflow-x-auto max-h-52 overflow-y-auto">
                  {JSON.stringify(selectedLog.output || { status: selectedLog.status || "SUCCESS", purchaseRequestId: selectedLog.purchaseRequestId || selectedLog.purchase_request_id || null }, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button onClick={() => setSelectedLog(null)}>Đóng lại</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
