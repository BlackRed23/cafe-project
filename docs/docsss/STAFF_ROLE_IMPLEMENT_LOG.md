# STAFF ROLE IMPLEMENTATION LOG

---

## PHẦN 7 — Resolve conflict AuthContext + fix thứ tự lưu token

**Ngày thực hiện:** 2026-07-17
**File chính:** `apps/web/src/contexts/AuthContext.tsx`

---

### 1. Resolve Merge Conflict

Đã xoá toàn bộ conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> dateduy`) khỏi hàm `login`.

**Thay đổi `redirectAfterAuth`:**
- **Trước (HEAD):** Chỉ check `ADMIN` → redirect `/admin/dashboard`
- **Sau (resolved):** Check `ADMIN || STAFF` → redirect `/admin/dashboard`, còn lại redirect `/`

**Thay đổi hàm `login` (resolved flow):**
```
1. await authApi.login(payload)         ← gọi API
2. persistAuth(data)                    ← lưu token + user vào localStorage (SYNC)
3. localStorage.getItem("access_token") ← verify token đã lưu thực sự
4. redirectAfterAuth(data.user)         ← full page redirect (window.location.href)
```

Thứ tự này đảm bảo: token luôn nằm trong localStorage **trước** khi trang mới load sau redirect, tránh tình trạng 401 do token chưa kịp persist.

---

### 2. Kiểm tra `persistAuth`

`persistAuth` là **synchronous hoàn toàn**:
- Chỉ dùng `localStorage.setItem` (synchronous API)
- Không có Promise, setTimeout, hay bất kỳ async wrapper nào
- Kết luận: gọi tuần tự `persistAuth → getItem → redirect` là đủ an toàn ✅

---

### 3. Kiểm tra `loginWithGoogle`

`loginWithGoogle` gọi `persistAuth(data)` trước `redirectAfterAuth(data.user)` — **đúng thứ tự**, không cần sửa ✅

---

### 4. Các file sửa thêm (lỗi build pre-existing)

| File | Lỗi | Sửa |
|------|-----|-----|
| apps/web (node_modules) | `@react-oauth/google` chưa install dù có trong package.json | `npm install @react-oauth/google` |
| `src/pages/LoginPage.tsx` | TS7031: `access_token` implicit any trong `useGoogleLogin` callback | Import `type TokenResponse`, thêm explicit type |
| `src/pages/RegisterPage.tsx` | TS7031: tương tự | Import `type TokenResponse`, thêm explicit type |

---

### 5. Kết quả Build

```
> @cafe-project/web@0.0.0 build
> tsc -b && vite build

vite v8.0.16 building client environment for production...
✓ 1874 modules transformed.
dist/index.html                              0.92 kB │ gzip:   0.52 kB
dist/assets/index-WnnrbulR.css             91.63 kB │ gzip:  14.72 kB
dist/assets/index-oVNViAnh.js            743.63 kB │ gzip: 192.41 kB
✓ built in 1.92s
```

**BUILD: ✅ PASS** — Không còn lỗi TypeScript hay conflict syntax.

---

### 6. Kết quả Test

| Loại test | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| Build TypeScript | ✅ PASS | Không còn lỗi TS |
| Login ADMIN → redirect /admin/dashboard | ⏳ Chờ test thực | Cần test bằng tài khoản ADMIN thật |
| Login STAFF → redirect /admin/dashboard | ⏳ Chờ test thực | Cần test bằng tài khoản STAFF thật |
| loginWithGoogle | ⏳ Chờ test thực | Cần tài khoản Google test |

**Hướng dẫn test thủ công:**
1. Mở DevTools > Application > Local Storage, xác nhận đang trống
2. Login bằng tài khoản ADMIN/STAFF
3. Xác nhận redirect đến `/admin/dashboard` thành công
4. Xác nhận Local Storage có `access_token` và `user` sau khi trang mới load
5. Xác nhận không bị lỗi 401

---

### 7. Phân tích nguyên nhân lỗi 401 trước đó

Lỗi 401 trước đây có 2 nguyên nhân tiềm năng:

1. **File bị conflict chưa resolve** → TypeScript build fail → code chạy với syntax lỗi.
   Sau khi resolve conflict và build pass, nguyên nhân này đã được loại bỏ ✅

2. **Thứ tự redirect** → Nhánh HEAD cũ không có verify step sau khi lưu token.
   Đã thêm `localStorage.getItem("access_token")` check trước khi redirect ✅

**Nếu vẫn còn 401 sau khi sửa, cần kiểm tra:**
- Response body của lỗi 401 (Bearer prefix, token format, token expire)
- CORS headers có thiếu `Authorization` không
- Backend middleware token validation logic
