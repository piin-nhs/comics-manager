"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Minus,
  Search,
  Moon,
  Sun,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Edit3,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  BookOpen,
  Star
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Hàm tính thời gian tương đối bằng tiếng Việt
const getRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;

    if (diffMs < 0) return 'vừa xong';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
};

export default function Home() {
  // State quản lý danh sách truyện và tìm kiếm
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt_desc');

  // State phân trang
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStories, setTotalStories] = useState(0);
  const limit = 6; // Giới hạn 6 truyện mỗi trang để tăng hiệu năng và tránh bị lag

  // State quản lý giao diện Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' hoặc 'edit'
  const [selectedStory, setSelectedStory] = useState(null);



  // State Form nhập liệu
  const [formData, setFormData] = useState({
    title: '',
    chap: '1',
    url: '',
    coverUrl: '',
    rating: 0,
    totalChaps: ''
  });

  // State cấu hình & phụ trợ
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);

  // State custom select (combobox)
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef(null);

  // State theo dõi các phần tử đang được chỉnh sửa nhanh số chap
  const [editingChapId, setEditingChapId] = useState(null);
  const [tempChapVal, setTempChapVal] = useState('');

  // State theo dõi copy link thành công
  const [copiedId, setCopiedId] = useState(null);

  // Ref lưu các truyện đã quét ngầm trong phiên làm việc để tránh quét lại nhiều lần trong cùng 1 view
  const scannedStoriesRef = useRef(new Set());

  // Ref lưu cache tìm kiếm/phân trang trên client để tải tức thì (0ms)
  const searchCache = useRef(new Map());

  // Danh sách các lựa chọn sắp xếp
  const sortOptions = [
    { value: 'updatedAt_desc', label: 'Mới cập nhật' },
    { value: 'updatedAt_asc', label: 'Cũ cập nhật' },
    { value: 'title_asc', label: 'Tên truyện A - Z' },
    { value: 'title_desc', label: 'Tên truyện Z - A' },
    { value: 'chap_desc', label: 'Số chap lớn nhất' }
  ];

  const currentSortOption = sortOptions.find(o => o.value === sortBy) || sortOptions[0];



  // Tự động quét tổng số chap từ link web chính
  const autoDetectTotalChaps = async (urlToScan) => {
    const url = urlToScan || formData.url;
    if (!url) {
      showToast('Vui lòng dán link đọc để tự động quét số chap', 'info');
      return;
    }

    showToast('Đang quét tự động tổng số chap...', 'info');
    try {
      const res = await fetch(`/api/get-total-chaps?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.success && data.totalChaps) {
        setFormData(prev => ({ ...prev, totalChaps: data.totalChaps.toString() }));
        showToast(`Quét thành công! Tìm thấy tổng cộng ${data.totalChaps} chap.`, 'success');
      } else {
        showToast(data.error || 'Không tìm thấy thông tin số chap trên trang này.', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi quét số chap.', 'danger');
    }
  };

  // Quét tổng số chap trong nền cho từng truyện (chỉ chạy tối đa 1 lần mỗi 2 giờ để tránh lag và tốn tài nguyên)
  const scanTotalChapsInBackground = async (story) => {
    if (!story.url) return;

    // Nếu mới quét trong vòng 2 giờ qua, bỏ qua không quét lại nữa
    const lastScanned = story.lastScannedAt ? new Date(story.lastScannedAt).getTime() : 0;
    const now = Date.now();
    if (now - lastScanned < 2 * 60 * 60 * 1000) {
      return;
    }

    try {
      const res = await fetch(`/api/get-total-chaps?url=${encodeURIComponent(story.url)}`);
      const data = await res.json();
      if (data.success && data.totalChaps) {
        const scannedTotal = data.totalChaps;
        
        // Tạo body PATCH
        const patchBody = {
          lastScannedAt: new Date().toISOString()
        };
        if (scannedTotal !== story.totalChaps) {
          patchBody.totalChaps = scannedTotal;
        }

        const patchRes = await fetch(`/api/stories/${story._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody)
        });
        
        const patchData = await patchRes.json();
        if (patchData.success) {
          // Xóa cache vì dữ liệu tổng số chap đã đổi
          searchCache.current.clear();
          // Cập nhật state cục bộ để giao diện tiến độ cập nhật ngay lập tức
          setStories(prev => prev.map(s => s._id === story._id ? { 
            ...s, 
            totalChaps: scannedTotal,
            lastScannedAt: patchBody.lastScannedAt
          } : s));
        }
      }
    } catch (err) {
      console.error(`Lỗi khi quét tự động số chap trong nền cho "${story.title}":`, err);
    }
  };

  // Tự động quét tổng số chap trong nền cho danh sách truyện hiện tại (Throttled)
  useEffect(() => {
    if (stories.length === 0) return;

    stories.forEach((story, index) => {
      if (!story.url) return;

      const cacheKey = `${story._id}_${story.url}`;
      // Chỉ quét 1 lần duy nhất trên client cho mỗi cặp ID + URL để tránh spam
      if (scannedStoriesRef.current.has(cacheKey)) return;
      scannedStoriesRef.current.add(cacheKey);

      // Chia nhỏ thời gian quét để tránh nghẽn luồng và quá tải server
      setTimeout(() => {
        scanTotalChapsInBackground(story);
      }, index * 400); // Mỗi truyện quét cách nhau 400ms
    });
  }, [stories]);

  // Debounce tìm kiếm để tránh gửi request liên tục làm lag và spam server
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350); // Đợi 350ms sau khi ngừng gõ mới cập nhật query tìm kiếm
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset về trang 1 khi query tìm kiếm thực tế thay đổi
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery]);

  // Load danh sách truyện khi bộ lọc hoặc số trang thay đổi
  useEffect(() => {
    fetchStories();
  }, [page, debouncedSearchQuery, sortBy]);

  // Load theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Xử lý click ngoài để đóng dropdown custom select
  useEffect(() => {
    function handleClickOutside(event) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target)) {
        setIsSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);



  // Hiển thị Toast
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Đổi giao diện Sáng/Tối
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    showToast(`Đã chuyển sang giao diện ${nextTheme === 'dark' ? 'tối' : 'sáng'}`, 'info');
  };

  // Gọi API lấy danh sách truyện (có phân trang)
  const fetchStories = async () => {
    const cacheKey = `${page}_${debouncedSearchQuery}_${sortBy}`;
    
    // Kiểm tra cache trên client trước để phản hồi tức thì
    if (searchCache.current.has(cacheKey)) {
      const cached = searchCache.current.get(cacheKey);
      setStories(cached.data);
      setTotalPages(cached.totalPages);
      setTotalStories(cached.total);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/stories?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearchQuery)}&sort=${sortBy}`);
      const data = await res.json();
      if (data.success) {
        setStories(data.data);
        if (data.pagination) {
          const totalPagesVal = data.pagination.totalPages || 1;
          const totalStoriesVal = data.pagination.total || 0;
          setTotalPages(totalPagesVal);
          setTotalStories(totalStoriesVal);
          
          // Lưu dữ liệu vào cache client
          searchCache.current.set(cacheKey, {
            data: data.data,
            totalPages: totalPagesVal,
            total: totalStoriesVal
          });
        }
      } else {
        showToast(data.error || 'Không thể tải dữ liệu', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Tải trước dữ liệu của trang khác khi di chuột vào nút phân trang (Hover Prefetching)
  const prefetchPage = async (p) => {
    if (p < 1 || p > totalPages) return;
    const cacheKey = `${p}_${debouncedSearchQuery}_${sortBy}`;
    if (searchCache.current.has(cacheKey)) return;

    try {
      const res = await fetch(`/api/stories?page=${p}&limit=${limit}&search=${encodeURIComponent(debouncedSearchQuery)}&sort=${sortBy}`);
      const data = await res.json();
      if (data.success && data.pagination) {
        searchCache.current.set(cacheKey, {
          data: data.data,
          totalPages: data.pagination.totalPages || 1,
          total: data.pagination.total || 0
        });
      }
    } catch (err) {
      console.error("Prefetch error:", err);
    }
  };

  // Thêm mới hoặc chỉnh sửa truyện
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('Vui lòng nhập tên truyện', 'danger');
      return;
    }

    // Kiểm tra trùng lặp link trước khi lưu để cảnh báo
    if (formData.url) {
      const isDuplicateLink = stories.find(s => s.url && s.url.trim().toLowerCase() === formData.url.trim().toLowerCase() && s._id !== selectedStory?._id);
      if (isDuplicateLink) {
        const confirmed = confirm(`Cảnh báo: Link này đã được sử dụng cho truyện "${isDuplicateLink.title}". Bạn vẫn muốn tiếp tục lưu chứ?`);
        if (!confirmed) return;
      }
    }

    // Giới hạn số chap điền vào form: không được bằng 0, không được lớn hơn số chap tổng
    const numVal = parseFloat(formData.chap);
    if (!isNaN(numVal)) {
      if (numVal <= 0) {
        showToast('Số chap đã đọc không được bằng 0 hoặc âm. Đã tự động điều chỉnh về 1.', 'warning');
        formData.chap = '1';
      }

      const total = parseFloat(formData.totalChaps) || 0;
      if (total > 0 && numVal > total) {
        showToast(`Số chap đã đọc không được lớn hơn tổng số chap (${total}). Đã tự động điều chỉnh về ${total}.`, 'warning');
        formData.chap = total.toString();
      }
    }

    try {
      let res;
      if (modalMode === 'add') {
        res = await fetch('/api/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            chap: formData.chap,
            url: formData.url,
            coverUrl: formData.coverUrl,
            rating: formData.rating,
            totalChaps: formData.totalChaps,
            status: 'Reading'
          })
        });
      } else {
        res = await fetch(`/api/stories/${selectedStory._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            chap: formData.chap,
            url: formData.url,
            coverUrl: formData.coverUrl,
            rating: formData.rating,
            totalChaps: formData.totalChaps
          })
        });
      }

      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Lưu thông tin thành công!');
        setIsModalOpen(false);
        resetForm();
        searchCache.current.clear(); // Xóa cache tìm kiếm client
        fetchStories();
      } else {
        showToast(data.error || 'Có lỗi xảy ra', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ', 'danger');
    }
  };

  // Xóa truyện
  const handleDelete = async (story) => {
    const confirmed = confirm(`Bạn có chắc chắn muốn xóa truyện "${story.title}" không?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/stories/${story._id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Đã xóa truyện "${story.title}"`);
        searchCache.current.clear(); // Xóa cache tìm kiếm client
        fetchStories();
      } else {
        showToast(data.error || 'Không thể xóa', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ', 'danger');
    }
  };

  // Tăng/Giảm nhanh 1 Chap (Sử dụng Optimistic Updates để triệt tiêu 100% độ trễ)
  const handleQuickChapStep = async (story, delta) => {
    const num = parseFloat(story.chap);
    if (isNaN(num)) {
      showToast('Chap hiện tại chứa chữ, vui lòng click để sửa thủ công', 'info');
      return;
    }

    let nextChapVal = Math.round((num + delta) * 100) / 100;

    // Giới hạn dưới: không được bằng 0 và không được âm (clamp ở 1)
    if (nextChapVal < 1) nextChapVal = 1;

    // Giới hạn trên: không được lớn hơn số chap tổng (nếu có số chap tổng hợp lệ)
    const total = parseFloat(story.totalChaps) || 0;
    if (total > 0 && nextChapVal > total) nextChapVal = total;

    const newChap = nextChapVal.toString();
    if (newChap === story.chap) return; // Đã đạt giới hạn, không cần lưu lại

    const originalChap = story.chap;
    
    // Cập nhật Optimistic - đổi số chap trên giao diện lập tức (0ms delay)
    setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: newChap } : s));
    searchCache.current.clear(); // Xóa cache tìm kiếm client vì dữ liệu đã thay đổi

    try {
      const res = await fetch(`/api/stories/${story._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chap: newChap })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Đã cập nhật "${story.title}" lên chap ${newChap}`);
        // Pháo hoa nhẹ
        confetti({ particleCount: 30, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 30, angle: 120, spread: 55, origin: { x: 1 } });
      } else {
        // Rollback nếu có lỗi từ server
        setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: originalChap } : s));
        showToast(data.error || 'Lỗi cập nhật số chap', 'danger');
      }
    } catch (err) {
      console.error(err);
      // Rollback nếu mất mạng
      setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: originalChap } : s));
      showToast('Lỗi kết nối máy chủ', 'danger');
    }
  };

  // Kích hoạt chỉnh sửa trực tiếp số chap
  const startInlineEdit = (story) => {
    setEditingChapId(story._id);
    setTempChapVal(story.chap);
  };

  // Lưu số chap chỉnh sửa trực tiếp (Sử dụng Optimistic Updates phản hồi tức thì)
  const saveInlineChap = async (story) => {
    if (editingChapId !== story._id) return;
    setEditingChapId(null);

    let val = tempChapVal.trim();
    if (!val) val = story.chap;

    const numVal = parseFloat(val);
    if (!isNaN(numVal)) {
      if (numVal <= 0) {
        showToast('Số chap không được bằng 0 hoặc âm. Đã điều chỉnh về 1.', 'warning');
        val = '1';
      }

      const total = parseFloat(story.totalChaps) || 0;
      if (total > 0 && numVal > total) {
        showToast(`Số chap không được lớn hơn tổng số chap (${total}). Đã điều chỉnh về ${total}.`, 'warning');
        val = total.toString();
      }
    }

    if (val === story.chap) return;

    const originalChap = story.chap;
    
    // Cập nhật Optimistic
    setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: val } : s));
    searchCache.current.clear(); // Xóa cache tìm kiếm client

    try {
      const res = await fetch(`/api/stories/${story._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chap: val })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Đã cập nhật "${story.title}" lên chap ${val}`);
        // Pháo hoa nhẹ
        confetti({ particleCount: 30, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 30, angle: 120, spread: 55, origin: { x: 1 } });
      } else {
        // Rollback
        setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: originalChap } : s));
        showToast(data.error || 'Lỗi cập nhật số chap', 'danger');
      }
    } catch (err) {
      console.error(err);
      // Rollback
      setStories(prev => prev.map(s => s._id === story._id ? { ...s, chap: originalChap } : s));
      showToast('Lỗi kết nối máy chủ', 'danger');
    }
  };

  // Helper thay thế số chương trong URL
  const replaceChapInUrl = (url, chapStr) => {
    if (!url) return '';

    const regex = /(chuong|chap|chapter|c|vol|tập|tap|episode|ep|[-_]+)(\d+(\.\d+)?)(?=\/*$|[?#])/i;
    const match = url.match(regex);
    if (match) {
      const fullMatch = match[0];
      const prefix = fullMatch.replace(match[2], '');

      const lastIndex = url.lastIndexOf(fullMatch);
      if (lastIndex !== -1) {
        return url.substring(0, lastIndex) + prefix + chapStr + url.substring(lastIndex + fullMatch.length);
      }
    }

    const endNumRegex = /\/(\d+(\.\d+)?)(?=\/*$|[?#])/;
    const endNumMatch = url.match(endNumRegex);
    if (endNumMatch) {
      const numberStr = endNumMatch[1];
      const lastIndex = url.lastIndexOf('/' + numberStr);
      if (lastIndex !== -1) {
        return url.substring(0, lastIndex) + '/' + chapStr + url.substring(lastIndex + 1 + numberStr.length);
      }
    }

    return url;
  };

  // Sinh URL cho chương hiện tại
  const getCurrentChapUrl = (url, currentChap) => {
    if (!url) return '';
    const num = parseFloat(currentChap);
    const currentChapStr = isNaN(num) ? currentChap : num.toString();
    return replaceChapInUrl(url, currentChapStr);
  };

  // Sinh URL cho chương tiếp theo
  const getNextChapUrl = (url, currentChap) => {
    if (!url) return '';
    const num = parseFloat(currentChap);
    const nextChap = isNaN(num) ? currentChap : (num + 1).toString();
    return replaceChapInUrl(url, nextChap);
  };

  // Sao chép link chương tiếp theo
  const handleCopyLink = (story) => {
    const nextUrl = getNextChapUrl(story.url, story.chap);
    if (!nextUrl) {
      showToast('Truyện này chưa gắn link đọc', 'info');
      return;
    }

    navigator.clipboard.writeText(nextUrl);
    setCopiedId(story._id);
    showToast('Đã sao chép link chương tiếp theo!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Mở modal thêm truyện
  const openAddModal = () => {
    setModalMode('add');
    resetForm();
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const openEditModal = (story) => {
    setModalMode('edit');
    setSelectedStory(story);
    setFormData({
      title: story.title,
      chap: story.chap,
      url: story.url || '',
      coverUrl: story.coverUrl || '',
      rating: story.rating || 0,
      totalChaps: story.totalChaps ? story.totalChaps.toString() : ''
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      chap: '1',
      url: '',
      coverUrl: '',
      rating: 0,
      totalChaps: ''
    });
    setSelectedStory(null);
  };

  // Chuyển trang
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <div className="app-container">
      {/* Toast thông báo */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <Sparkles size={16} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header chính */}
      <header className="header-wrapper">
        <h1 className="brand-title">
          <BookOpen size={30} style={{ color: 'var(--primary-color)' }} />
          <span>Quản lý Truyện Đã Đọc</span>
        </h1>
        <div className="controls-group">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} />
            <span>Thêm Truyện Mới</span>
          </button>
          <button className="btn-icon" onClick={toggleTheme} aria-label="Đổi giao diện">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>



      {/* Thanh tìm kiếm và bộ sắp xếp */}
      <section className="toolbar-container glass-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Nhập tên truyện cần tìm..."
              className="form-control"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingRight: searchQuery ? '36px' : '14px' }}
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
                title="Xóa tìm kiếm"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Custom Select dropdown (Combobox) */}
          <div className="custom-select-wrapper" ref={sortDropdownRef}>
            <button
              type="button"
              className="custom-select-trigger"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            >
              <span>{currentSortOption.label}</span>
              <ChevronDown size={16} className={`arrow-icon ${isSortDropdownOpen ? 'open' : ''}`} />
            </button>
            {isSortDropdownOpen && (
              <div className="custom-select-options">
                {sortOptions.map(option => (
                  <div
                    key={option.value}
                    className={`custom-select-option ${sortBy === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSortBy(option.value);
                      setIsSortDropdownOpen(false);
                    }}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Danh sách truyện dạng THẺ CÁ NHÂN (Cards Grid) */}
      {loading ? (
        <div className="comics-grid">
          {Array.from({ length: limit }).map((_, idx) => (
            <div key={idx} className="comic-card-v2 skeleton" style={{ minHeight: '230px', opacity: 0.7 }}>
              <div className="card-top-info">
                <div className="card-thumb skeleton-block" style={{ width: '105px', height: '147px', borderRadius: '8px', border: 'none' }} />
                <div className="card-details" style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-start', padding: '4px 0' }}>
                  <div className="skeleton-line" style={{ width: '80%', height: '18px', borderRadius: '4px' }} />
                  <div className="skeleton-line" style={{ width: '50%', height: '12px', borderRadius: '4px' }} />
                  <div className="skeleton-line" style={{ width: '100%', height: '30px', borderRadius: '4px', marginTop: '12px' }} />
                  <div className="skeleton-line" style={{ width: '40%', height: '12px', borderRadius: '4px', marginTop: 'auto' }} />
                </div>
              </div>
              <div className="card-chap-row skeleton-block" style={{ height: '34px', borderRadius: '8px', border: 'none' }} />
              <div className="card-actions-v2" style={{ gap: '6px' }}>
                <div className="skeleton-block" style={{ flexGrow: 1, height: '32px', borderRadius: '8px' }} />
                <div className="skeleton-block" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                <div className="skeleton-block" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Không tìm thấy truyện nào. Vui lòng thêm truyện mới hoặc điều chỉnh bộ lọc tìm kiếm.
          </p>
        </div>
      ) : (
        <>
          <div className="comics-grid">
            {stories.map((story) => {
              const currentUrl = getCurrentChapUrl(story.url, story.chap);
              const nextUrl = getNextChapUrl(story.url, story.chap);
              const nextChapNum = (parseFloat(story.chap) + 1) || '';
              const currentChapNum = parseFloat(story.chap) || 0;
              const totalChapNum = parseFloat(story.totalChaps) || 0;
              const hasNewChap = totalChapNum > currentChapNum;
              const isReadComplete = totalChapNum > 0 && currentChapNum >= totalChapNum;
              const unreadCount = totalChapNum > currentChapNum ? Number((totalChapNum - currentChapNum).toFixed(2)) : 0;

              return (
                <div key={story._id} className={`comic-card-v2 ${isReadComplete ? 'read-completed' : ''}`}>

                  {/* Dòng đầu: Ảnh bìa + Tên truyện (Không còn chữ tên miền bên dưới) */}
                  <div className="card-top-info">
                    <div className="card-thumb-wrapper" style={{ position: 'relative', flexShrink: 0 }}>
                      {story.coverUrl ? (
                        <img
                          src={story.coverUrl}
                          alt={story.title}
                          className="card-thumb"
                          onClick={() => window.open(story.coverUrl, '_blank')}
                          title="Click để phóng to ảnh bìa"
                        />
                      ) : (
                        <div className="card-thumb" title="Chưa có ảnh bìa">
                          📖
                        </div>
                      )}

                    </div>
                    <div className="card-details">
                      <h4 className="card-title-v2" title={story.title}>{story.title}</h4>

                      {/* Đánh giá số sao */}
                      <div className="card-rating-stars" title={`Đánh giá: ${story.rating || 0}/5 sao`} style={{ display: 'flex', gap: '2px', margin: '4px 0' }}>
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            size={13}
                            style={{
                              fill: idx < (story.rating || 0) ? '#fbbf24' : 'none',
                              color: idx < (story.rating || 0) ? '#fbbf24' : 'var(--border-color)',
                            }}
                          />
                        ))}
                      </div>

                      {/* Thanh tiến độ đọc */}
                      {(() => {
                        const current = parseFloat(story.chap) || 0;
                        const total = parseFloat(story.totalChaps) || 0;
                        const percent = total > 0
                          ? (current >= total ? 100 : Math.min(99, Math.round((current / total) * 100)))
                          : 0;

                        return total > 0 ? (
                          <div className="card-progress-wrapper" style={{ margin: '4px 0 8px 0' }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              fontWeight: '700',
                              color: percent === 100 ? 'var(--success)' : 'var(--text-secondary)',
                              marginBottom: '2px'
                            }}>
                              <span>Tiến độ: {story.chap}/{story.totalChaps} chap</span>
                              <span style={{ color: percent === 100 ? 'var(--success)' : 'inherit' }}>{percent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${percent}%`,
                                height: '100%',
                                backgroundColor: percent === 100 ? 'var(--success)' : 'var(--primary-color)',
                                borderRadius: '3px',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '4px 0 8px 0' }}>
                            Chưa quét số chap mới
                          </div>
                        );
                      })()}

                      <div className="card-meta-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto', width: '100%', flexWrap: 'wrap' }}>
                        {story.updatedAt && (
                          <span className="card-update-time" title="Cập nhật cuối">
                            {getRelativeTime(story.updatedAt)}
                          </span>
                        )}
                        {unreadCount > 0 && (
                          <span className="card-unread-count" title="Số chap chưa đọc">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dòng giữa: Thay "Đã đọc tới:" bằng Link chương hiện tại nếu có */}
                  <div className="card-chap-row">
                    {story.url ? (
                      <a
                        href={currentUrl}
                        target="comic_reader"
                        rel="noopener noreferrer"
                        className="current-link"
                        title="Mở chương hiện tại bạn đã đọc"
                      >
                        <span>Link hiện tại</span>
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="no-link-text">Chưa gắn link</span>
                    )}

                    {/* Bộ tăng giảm số chap */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="chap-quick-btn"
                        onClick={() => handleQuickChapStep(story, -1)}
                        disabled={parseFloat(story.chap) <= 1}
                        title="Giảm 1 chap"
                      >
                        <Minus size={12} />
                      </button>

                      {editingChapId === story._id ? (
                        <input
                          type="text"
                          value={tempChapVal}
                          onChange={(e) => setTempChapVal(e.target.value)}
                          onBlur={() => saveInlineChap(story)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineChap(story);
                            if (e.key === 'Escape') setEditingChapId(null);
                          }}
                          autoFocus
                          style={{
                            width: '50px',
                            textAlign: 'center',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            border: '1px solid var(--primary-color)',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: '700',
                            outline: 'none'
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => startInlineEdit(story)}
                          title="Click để sửa nhanh"
                          style={{
                            display: 'inline-block',
                            minWidth: '42px',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px dashed var(--border-color)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '700',
                            color: 'var(--primary-color)',
                            textAlign: 'center'
                          }}
                        >
                          {story.chap}
                        </span>
                      )}

                      <button
                        className="chap-quick-btn"
                        onClick={() => handleQuickChapStep(story, 1)}
                        disabled={parseFloat(story.totalChaps) > 0 && parseFloat(story.chap) >= parseFloat(story.totalChaps)}
                        title="Tăng 1 chap"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Dòng cuối: Nút đọc tiếp + các icon hành động */}
                  <div className="card-actions-v2">
                    {story.url && (
                      <>
                        {isReadComplete ? (
                          <button
                            className="card-nav-btn disabled"
                            disabled
                            title="Bạn đã đọc hết chương mới nhất"
                          >
                            <span>Hết chap mới</span>
                          </button>
                        ) : (
                          <a
                            href={nextUrl}
                            target="comic_reader"
                            rel="noopener noreferrer"
                            className={`card-nav-btn ${hasNewChap ? 'has-new-chap' : ''}`}
                            title={`Đọc Chap ${nextChapNum}`}
                          >
                            {hasNewChap && <span className="pulsing-green-dot" />}
                            <span>Đọc Chap {nextChapNum || 'Tiếp'}</span>
                            <ExternalLink size={12} />
                          </a>
                        )}

                        <button
                          className="btn-icon"
                          onClick={() => handleCopyLink(story)}
                          style={{ width: '32px', height: '32px', borderRadius: '8px' }}
                          title="Copy link chương tiếp theo"
                        >
                          {copiedId === story._id ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                        </button>
                        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 2px' }}></div>
                      </>
                    )}

                    <button
                      className="btn-icon"
                      onClick={() => openEditModal(story)}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', marginLeft: story.url ? '0' : 'auto' }}
                      title="Sửa thông tin"
                    >
                      <Edit3 size={12} />
                    </button>

                    <button
                      className="btn-icon"
                      onClick={() => handleDelete(story)}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', color: 'var(--danger)' }}
                      title="Xóa truyện"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Giao diện phân trang căn giữa cân đối */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <div className="pagination-buttons">
                <button
                  className="page-btn"
                  onClick={() => handlePageChange(page - 1)}
                  onMouseEnter={() => prefetchPage(page - 1)}
                  disabled={page === 1}
                  title="Trang trước"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) {
                    if (p === 2 || p === totalPages - 1) {
                      return <span key={p} style={{ color: 'var(--text-secondary)', padding: '0 4px' }}>...</span>;
                    }
                    return null;
                  }

                  return (
                    <button
                      key={p}
                      className={`page-btn ${page === p ? 'active' : ''}`}
                      onClick={() => handlePageChange(p)}
                      onMouseEnter={() => prefetchPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  className="page-btn"
                  onClick={() => handlePageChange(page + 1)}
                  onMouseEnter={() => prefetchPage(page + 1)}
                  disabled={page === totalPages}
                  title="Trang sau"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <span className="page-info-text">
                Hiển thị {stories.length}/{totalStories} bộ truyện
              </span>
            </div>
          )}
        </>
      )}

      {/* Modal Form Thêm/Sửa truyện */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {modalMode === 'add' ? '➕ Thêm Truyện Mới' : '📝 Chỉnh Sửa Truyện'}
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tên Truyện <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Nhập tên truyện..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Số Chap Đã Đọc</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className="form-control"
                  placeholder="Nhập số chương đã đọc..."
                  value={formData.chap}
                  onChange={(e) => setFormData({ ...formData, chap: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Link Đọc Chương Hiện Tại (URL)</label>
                <input
                  type="url"
                  className="form-control"
                  placeholder="Dán link chương bạn đã đọc (ví dụ: https://.../chuong-46)..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value) {
                      autoDetectTotalChaps(e.target.value);
                    }
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Link Ảnh Bìa Truyện (Cover Image URL)</label>
                <input
                  type="url"
                  className="form-control"
                  placeholder="Dán link ảnh bìa truyện tranh (tùy chọn)..."
                  value={formData.coverUrl}
                  onChange={(e) => setFormData({ ...formData, coverUrl: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Đánh Giá Truyện (Rating)</label>
                <div className="form-rating-selector" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const starVal = idx + 1;
                      return (
                        <button
                          type="button"
                          key={idx}
                          className="star-selector-btn"
                          onClick={() => {
                            if (formData.rating === starVal) {
                              setFormData({ ...formData, rating: 0 }); // Nhấp lại sao hiện tại để xóa đánh giá
                            } else {
                              setFormData({ ...formData, rating: starVal });
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title={`${starVal} sao`}
                        >
                          <Star
                            size={24}
                            style={{
                              fill: starVal <= formData.rating ? '#fbbf24' : 'none',
                              color: starVal <= formData.rating ? '#fbbf24' : 'var(--border-color)',
                              transition: 'transform 0.15s ease'
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                    {formData.rating > 0 ? `${formData.rating}/5 sao` : 'Chưa đánh giá'}
                  </span>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'add' ? 'Thêm mới' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
