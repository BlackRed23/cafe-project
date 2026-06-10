import React from "react";
import { Inbox } from "lucide-react";
import { Button } from "./Button";
import { useNavigate } from "react-router-dom";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  actionPath?: string;
  onActionClick?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "Không tìm thấy dữ liệu",
  description = "Danh sách này hiện tại không có dữ liệu để hiển thị.",
  actionText,
  actionPath,
  onActionClick,
}) => {
  const navigate = useNavigate();

  const handleAction = () => {
    if (onActionClick) {
      onActionClick();
    } else if (actionPath) {
      navigate(actionPath);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
      <div className="p-4 bg-slate-100 rounded-full text-slate-400 mb-4">
        <Inbox size={32} />
      </div>
      <h3 className="text-[17px] font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-[15px] text-slate-500 max-w-xs mb-6">{description}</p>
      {(actionText && (actionPath || onActionClick)) && (
        <Button onClick={handleAction} size="sm">
          {actionText}
        </Button>
      )}
    </div>
  );
};
