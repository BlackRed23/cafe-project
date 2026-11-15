import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ingredientsApi } from "../../api/ingredients.api";
import type { Ingredient, IngredientTransaction } from "../../types/ingredient.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { ArrowLeft, Layers, History } from "lucide-react";
import { getErrorMessage } from "../../api/client";

export const AdminIngredientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setIsLoading(true);
        const [ingData, txData] = await Promise.all([
          ingredientsApi.getIngredientById(id),
          ingredientsApi.getTransactions(id),
        ]);
        setIngredient(ingData);
        setTransactions(txData);
      } catch (err) {
        setError(getErrorMessage(err) || "Không thể tải chi tiết nguyên liệu.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  if (isLoading) {
    return (
      <div className="py-20">
        <Loading message="Đang tải chi tiết nguyên liệu..." />
      </div>
    );
  }

  if (error || !ingredient) {
    return (
      <div className="p-8 text-center">
        <p className="text-rose-600 font-semibold">{error || "Không tìm thấy nguyên liệu."}</p>
        <Link to="/admin/ingredients" className="text-amber-800 underline text-sm mt-3 inline-block">
          Quay lại danh sách nguyên liệu
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div>
        <Link
          to="/admin/ingredients"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 font-medium"
        >
          <ArrowLeft size={16} /> Quay lại danh sách nguyên liệu
        </Link>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 font-serif">{ingredient.name}</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              SKU: {ingredient.sku} • Đơn vị chuẩn: {ingredient.baseUnit}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Giá vốn bình quân gia quyền</span>
            <span className="text-lg font-black text-amber-800">
              {ingredient.costPerBaseUnit.toLocaleString("vi-VN", {
                maximumFractionDigits: 4,
              })}
              đ / {ingredient.baseUnit}
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 pt-4 text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50">
            <span className="text-xs text-slate-400 block">Tồn thực tế</span>
            <span className="font-bold text-slate-800 text-base">
              {ingredient.quantity.toLocaleString("vi-VN")} {ingredient.baseUnit}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/60">
            <span className="text-xs text-slate-400 block">Đang giữ cho đơn</span>
            <span className="font-bold text-amber-800 text-base">
              {ingredient.reserved.toLocaleString("vi-VN")} {ingredient.baseUnit}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/60">
            <span className="text-xs text-slate-400 block">Khả dụng</span>
            <span className="font-bold text-emerald-700 text-base">
              {ingredient.availableQuantity.toLocaleString("vi-VN")} {ingredient.baseUnit}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50">
            <span className="text-xs text-slate-400 block">Tổng giá trị tồn kho</span>
            <span className="font-black text-slate-900 text-base">
              {formatCurrency(ingredient.stockValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Batches */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
          <Layers size={16} className="text-amber-800" />
          Danh sách lô nguyên liệu còn tồn (FIFO theo hạn sử dụng)
        </h3>
        {!ingredient.batches || ingredient.batches.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Hiện không có lô nguyên liệu nào còn tồn.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold">
                  <th className="py-2.5 px-3">Mã lô</th>
                  <th className="py-2.5 px-3 text-right">SL ban đầu</th>
                  <th className="py-2.5 px-3 text-right">Còn lại</th>
                  <th className="py-2.5 px-3 text-right">Đơn giá lô / {ingredient.baseUnit}</th>
                  <th className="py-2.5 px-3 text-right">Giá trị còn lại</th>
                  <th className="py-2.5 px-3">Ngày nhập</th>
                  <th className="py-2.5 px-3">Hạn sử dụng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ingredient.batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{b.batchCode}</td>
                    <td className="py-2.5 px-3 text-right">
                      {b.quantityInitial.toLocaleString("vi-VN")} {ingredient.baseUnit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                      {b.quantityRemaining.toLocaleString("vi-VN")} {ingredient.baseUnit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-amber-800">
                      {b.unitCost.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}đ
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                      {formatCurrency(b.batchValue)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{formatDate(b.receivedAt)}</td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {b.expirationDate ? formatDate(b.expirationDate) : "Không giới hạn"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
          <History size={16} className="text-amber-800" />
          Lịch sử biến động & Chi phí nguyên liệu
        </h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Chưa có giao dịch nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold">
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3">Loại GD</th>
                  <th className="py-2.5 px-3">Mã lô</th>
                  <th className="py-2.5 px-3 text-right">Số lượng ({ingredient.baseUnit})</th>
                  <th className="py-2.5 px-3 text-right">Đơn giá vốn</th>
                  <th className="py-2.5 px-3 text-right">Thành tiền vốn</th>
                  <th className="py-2.5 px-3">Lý do / Tham chiếu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-slate-500">{formatDate(tx.createdAt)}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-700">{tx.type}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{tx.batchCode || "-"}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        tx.quantity > 0 ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {tx.unitCost > 0
                        ? `${tx.unitCost.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}đ`
                        : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-800">
                      {tx.totalCost > 0 ? formatCurrency(tx.totalCost) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{tx.reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
