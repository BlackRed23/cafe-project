import React, { useState, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

interface Column<T> {
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  isLoading?: boolean;
  pageSize?: number;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  searchPlaceholder = "Tìm kiếm...",
  searchValue,
  onSearchChange,
  isLoading = false,
  pageSize = 6, // 6 items per page by default
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when search term or data length changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, data.length]);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedData = data.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-strokedark dark:bg-boxdark overflow-hidden flex flex-col">
      {/* Table search toolbar */}
      {onSearchChange !== undefined && (
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-[15px] outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50"
            />
          </div>
        </div>
      )}

      {/* Table wrapper */}
      <div className="max-w-full overflow-x-auto flex-1">
        <table className="w-full table-auto">
          <thead>
            <tr className="bg-slate-50 text-left border-b border-slate-100 dark:bg-meta-4">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`py-4 px-6 font-bold text-sm uppercase text-slate-500 tracking-wide ${
                    col.className || ""
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-14 text-slate-400 font-medium text-[15px]">
                  Đang tải danh sách...
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-14 text-slate-400 font-medium text-[15px]">
                  Không tìm thấy kết quả nào.
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => (
                <tr
                  key={item.id || rowIdx}
                  className="hover:bg-slate-50/50 dark:hover:bg-meta-4/30 transition-colors"
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className={`py-4 px-6 text-[14.5px] text-slate-700 ${
                        col.className || ""
                      }`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && totalItems > 0 && (
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/30">
          <div className="text-[14px] text-slate-500">
            Hiển thị từ <span className="font-semibold text-slate-800">{totalItems === 0 ? 0 : startIndex + 1}</span> đến{" "}
            <span className="font-semibold text-slate-800">{endIndex}</span> trong tổng số{" "}
            <span className="font-semibold text-slate-800">{totalItems}</span> kết quả
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              {/* Previous page button */}
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors"
                title="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((page) => {
                  const isCurrent = page === currentPage;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-8 h-8 px-2 rounded-lg text-[14px] font-semibold transition-all ${
                        isCurrent
                          ? "bg-amber-800 text-white shadow-sm"
                          : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              {/* Next page button */}
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors"
                title="Trang tiếp"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
