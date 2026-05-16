import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Register from './pages/Register';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Chuyển hướng mặc định vào thẳng trang Đăng ký */}
        <Route path="/" element={<Navigate to="/register" replace />} />

        {/* Đường dẫn tới trang Đăng ký */}
        <Route path="/register" element={<Register />} />

        {/* Tạm thời để trống trang Login, chúng ta sẽ làm sau */}
        <Route path="/login" element={<div className="p-10 text-center text-2xl">Trang Đăng Nhập đang xây dựng...</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;