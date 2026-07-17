import React, { useState, useEffect } from "react";
import { usersApi } from "../../api/users.api";
import type { User } from "../../types/auth.types";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { Select } from "../../components/common/Select";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DataTable } from "../../components/admin/DataTable";
import { useToast } from "../../contexts/ToastContext";
import { Plus, Edit2, Trash2, Users, Shield, User as UserIcon } from "lucide-react";

export const AdminUsersPage: React.FC = () => {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"ADMIN" | "CUSTOMER" | "USER" | "STAFF">("CUSTOMER");
  const [isActiveUser, setIsActiveUser] = useState(true);
  const [password, setPassword] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Delete confirm dialog states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError("Không thể tải danh sách thành viên.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setName(user.name);
      setEmail(user.email);
      setRole(user.role as any);
      setPhone(user.phone || "");
      setIsActiveUser(user.is_active !== false && user.isActive !== false);
      setPassword("");
    } else {
      setSelectedUser(null);
      setName("");
      setEmail("");
      setRole("CUSTOMER");
      setPhone("");
      setPassword("");
      setIsActiveUser(true);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      toast.warning("Thiếu thông tin", "Vui lòng điền đầy đủ Tên và Email.");
      return;
    }

    setModalLoading(true);
    const payload = {
      name,
      email,
      role,
      phone,
      is_active: isActiveUser,
      isActive: isActiveUser,
    };

    try {
      if (selectedUser) {
        // Edit User
        await usersApi.updateUser(selectedUser.id, payload);
        toast.success("Cập nhật thành công", `Thông tin "${payload.name}" đã được cập nhật.`);
      } else {
        // Create User - need password
        if (!password) {
          toast.warning("Thiếu thông tin", "Vui lòng nhập mật khẩu cho tài khoản mới.");
          setModalLoading(false);
          return;
        }
        await usersApi.createUser({ ...payload, password });
        toast.success("Tạo thành công", `Tài khoản "${payload.name}" đã được thêm mới.`);
      }
      handleCloseModal();
      // Reload từ DB để đồng bộ chính xác
      await fetchUsers();
    } catch (err) {
      toast.error("Thao tác thất bại", "Đã xảy ra lỗi khi lưu thông tin.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await usersApi.deleteUser(deleteId);
      setUsers((prev) => prev.filter((u) => u.id !== deleteId));
      setDeleteId(null);
      toast.success("Xóa thành công", "Nhân viên đã được xóa khỏi hệ thống.");
    } catch (err) {
      toast.error("Xóa thất bại", "Đã xảy ra lỗi khi xóa nhân viên.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search))
  );

  const getAvatarChar = (name: string) => {
    return name ? name.trim().charAt(0).toUpperCase() : "U";
  };

  const columns = [
    {
      header: "Thành viên",
      render: (u: User) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-700/10 to-amber-900/20 border border-amber-900/10 flex items-center justify-center font-bold text-amber-800 text-[15px]">
            {getAvatarChar(u.name)}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{u.name}</p>
            <p className="text-[12px] text-slate-400 mt-0.5">{u.id}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Email liên hệ",
      render: (u: User) => <span className="text-slate-600 font-medium">{u.email}</span>,
    },
    {
      header: "Số điện thoại",
      render: (u: User) => <span className="text-slate-500 font-medium">{u.phone || "---"}</span>,
    },
    {
      header: "Quyền hạn",
      render: (u: User) => {
        let label = "Khách hàng";
        let icon = <UserIcon size={12} />;
        let colorClass = "bg-slate-50 text-slate-600 border-slate-200";

        if (u.role === "ADMIN") {
          label = "Admin";
          icon = <Shield size={12} />;
          colorClass = "bg-amber-50 text-amber-800 border-amber-200";
        } else if (u.role === "STAFF") {
          label = "Nhân viên";
          icon = <Users size={12} />;
          colorClass = "bg-blue-50 text-blue-800 border-blue-200";
        }

        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold border transition-colors ${colorClass}`}>
            {icon}
            {label}
          </span>
        );
      },
    },
    {
      header: "Trạng thái",
      render: (u: User) => {
        const active = u.is_active !== false && u.isActive !== false;
        return active ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-700">
            ● Hoạt động
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 border border-rose-100 text-rose-600">
            ○ Đã khóa
          </span>
        );
      },
    },
    {
      header: "Hành động",
      className: "text-right",
      render: (u: User) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleOpenModal(u)}
            className="p-2 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all"
            title="Chỉnh sửa thông tin"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => setDeleteId(u.id)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
            title="Xóa tài khoản"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải danh sách thành viên..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-amber-800" />
          <span className="text-sm font-semibold text-slate-600">
            {users.length} thành viên trong hệ thống
          </span>
        </div>
        <Button onClick={() => handleOpenModal()} className="flex items-center gap-1.5 w-full sm:w-auto">
          <Plus size={16} /> Thêm thành viên
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <EmptyState
          title="Chưa có thành viên"
          description="Hệ thống chưa có tài khoản nào được đăng ký. Nhấn nút để thêm tài khoản mới."
          actionText="Thêm thành viên mới"
          onActionClick={() => handleOpenModal()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredUsers}
          searchPlaceholder="Tìm kiếm thành viên..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedUser ? "Cập nhật thành viên" : "Thêm thành viên mới"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Tên thành viên"
            placeholder="Ví dụ: Nguyễn Văn A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={modalLoading}
          />
          <Input
            label="Địa chỉ Email"
            type="email"
            placeholder="example@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={modalLoading}
          />
          <Input
            label="Số điện thoại"
            type="tel"
            placeholder="Ví dụ: 0987654321"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={modalLoading}
          />
          <Select
            label="Quyền hạn hệ thống"
            options={[
              { value: "CUSTOMER", label: "Khách hàng thân thiết" },
              { value: "STAFF", label: "Nhân viên (STAFF)" },
              { value: "ADMIN", label: "Quản trị viên (ADMIN)" },
            ]}
            value={role}
            onChange={(e: any) => setRole(e.target.value)}
            disabled={modalLoading}
          />
          <Select
            label="Trạng thái tài khoản"
            options={[
              { value: "true", label: "Đang hoạt động (Active)" },
              { value: "false", label: "Khóa tài khoản (Inactive)" },
            ]}
            value={isActiveUser ? "true" : "false"}
            onChange={(e: any) => setIsActiveUser(e.target.value === "true")}
            disabled={modalLoading}
          />

          {/* Password field - only show when creating new user */}
          {!selectedUser && (
            <Input
              label="Mật khẩu *"
              type="password"
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={modalLoading}
            />
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100 mt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleCloseModal}
              disabled={modalLoading}
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              className="flex-1"
              isLoading={modalLoading}
            >
              {selectedUser ? "Cập nhật" : "Tạo thành viên"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xóa thành viên"
        message="Bạn có chắc chắn muốn xóa thành viên này khỏi hệ thống? Thao tác này sẽ xóa tài khoản người dùng vĩnh viễn."
        confirmText="Xóa tài khoản"
        cancelText="Hủy"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
