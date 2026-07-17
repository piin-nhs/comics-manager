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
  Star,
  RefreshCw,
  Globe
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

// Hàm trích xuất đường dẫn tương đối của truyện (ví dụ: truyen/tuyet-the-quan-lam)
const getRelativeStoryPath = (url) => {
  if (!url) return '';
  let path = url.trim();

  // Trích xuất path nếu nhập link tuyệt đối có chứa http/https
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path);
      path = parsed.pathname;
    } catch (e) {
      console.error("Error parsing URL:", e);
    }
  }

  // Cắt bỏ phần chương ở cuối (ví dụ: /chuong-62 -> ...)
  const regex = /\/(chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\d+(\.\d+)?)(?:\.[a-zA-Z0-9]+)?(?=\/*$|[?#]|\/)/i;
  const match = path.match(regex);
  if (match) {
    const lastIndex = path.lastIndexOf(match[0]);
    if (lastIndex !== -1) {
      path = path.substring(0, lastIndex);
    }
  }

  // Loại bỏ dấu gạch chéo đầu và cuối để chuẩn hóa
  return path.replace(/^\/|\/$/g, '');
};

// Hàm trích xuất đường dẫn ảnh bìa truyện
// - URL tuyệt đối: giữ nguyên toàn bộ
// - URL tương đối (/path/...): loại bỏ dấu gạch chéo đầu/cuối
const getRelativeCoverPath = (url) => {
  if (!url) return '';
  const path = url.trim();

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  return path.replace(/^\/|\/$/g, '');
};


// Cấu hình theo từng domain: prefix chương khi tạo URL đọc
const DOMAIN_CONFIGS = {
  'truyenqq.com.vn': { chapPrefix: 'chapter-' },
  'truyenqq.net': { chapPrefix: 'chapter-' },
  'goctruyentranhvui30.com': { chapPrefix: 'chuong-' },
  // Thêm domain khác tại đây nếu cần
};

// Lấy config của domain từ URL hoặc hostname
const getDomainConfig = (domainOrUrl) => {
  if (!domainOrUrl) return null;
  try {
    let hostname = domainOrUrl;
    if (domainOrUrl.startsWith('http://') || domainOrUrl.startsWith('https://')) {
      hostname = new URL(domainOrUrl).hostname;
    }
    // Khớp chính xác hoặc subdomain (www.truyenqq.com.vn → truyenqq.com.vn)
    const key = Object.keys(DOMAIN_CONFIGS).find(k =>
      hostname === k || hostname.endsWith('.' + k)
    );
    return key ? DOMAIN_CONFIGS[key] : null;
  } catch {
    return null;
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

  // State cấu hình domain dùng chung
  const [comicDomain, setComicDomain] = useState('https://goctruyentranhvui30.com');
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [tempDomain, setTempDomain] = useState('');
  const [saveDomainLoading, setSaveDomainLoading] = useState(false);



  // State Form nhập liệu
  const [formData, setFormData] = useState({
    title: '',
    chap: '1',
    url: '',
    coverUrl: '',
    rating: 0,
    totalChaps: '',
    status: 'Reading'
  });

  // State cấu hình & phụ trợ
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);

  // State custom select (combobox)
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef(null);

  // State bộ lọc tiến độ đọc
  const [filterProgress, setFilterProgress] = useState('incomplete'); // 'all' | 'complete' | 'incomplete'
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef(null);

  // State bộ lọc trạng thái truyện
  const [filterStatus, setFilterStatus] = useState('Reading'); // 'all' | 'Reading' | 'Completed' | 'OnHold' | 'Dropped'
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);

  // Danh sách trạng thái truyện
  const storyStatuses = [
    { value: 'Reading', label: 'Đang đọc', color: '#6366f1' },
    { value: 'Completed', label: 'Hoàn thành', color: '#10b981' },
    { value: 'OnHold', label: 'Tạm dừng', color: '#f59e0b' },
    { value: 'Dropped', label: 'Bỏ đọc', color: '#ef4444' }
  ];

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
    { value: 'unread_asc', label: 'Chưa đọc ít nhất' },
    { value: 'unread_desc', label: 'Chưa đọc nhiều nhất' },
    { value: 'chap_asc', label: 'Số chap nhỏ nhất' },
    { value: 'chap_desc', label: 'Số chap lớn nhất' },
    { value: 'title_asc', label: 'Tên A → Z' },
    { value: 'title_desc', label: 'Tên Z → A' }
  ];

  const currentSortOption = sortOptions.find(o => o.value === sortBy) || sortOptions[0];



  // Chuẩn hóa URL truyện trước khi lưu:
  // - URL thuộc domain chung → strip về relative path (hành vi cũ, tương thích dữ liệu hiện tại)
  // - URL thuộc domain khác → giữ nguyên full URL để detect domain đúng
  const normalizeStoryUrl = (rawUrl, globalDomain) => {
    if (!rawUrl) return '';
    // Bỏ phần chapter ở cuối (ví dụ: .../chapter-315 → ...)
    const withoutChap = rawUrl
      .replace(/\/(chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*[\d.]+\/*$/i, '')
      .replace(/\/+$/, '');

    if (withoutChap.startsWith('http://') || withoutChap.startsWith('https://')) {
      try {
        const parsed = new URL(withoutChap);
        const urlDomain = `${parsed.protocol}//${parsed.host}`;
        // Nếu cùng domain chung → lưu relative (bỏ domain)
        if (urlDomain === globalDomain) {
          return parsed.pathname.replace(/^\/|\/$/g, '');
        }
        // Domain khác → giữ full URL
        return withoutChap;
      } catch {
        return withoutChap;
      }
    }
    // Đã là relative path → giữ nguyên
    return withoutChap;
  };

  // Tự động quét tổng số chap từ link web chính
  const autoDetectTotalChaps = async (urlToScan) => {
    const url = urlToScan || formData.url;

    if (!url) {
      showToast('Vui lòng dán link đọc để tự động quét số chap', 'info');
      return;
    }

    // Chuẩn hóa URL theo domain:
    // - Nếu thuộc domain chung (goctruyentranhvui30.com) → lưu relative path (hành vi cũ)
    // - Nếu domain khác (truyenqq...) → giữ full URL
    const normalizedUrl = normalizeStoryUrl(url.trim(), getComicDomain());
    if (normalizedUrl && normalizedUrl !== formData.url) {
      setFormData(prev => ({ ...prev, url: normalizedUrl }));
    }

    showToast('Đang quét tự động tổng số chap & ảnh bìa...', 'info');
    try {
      const titleParam = formData.title ? `&title=${encodeURIComponent(formData.title)}` : '';
      const res = await fetch(`/api/get-total-chaps?url=${encodeURIComponent(url)}${titleParam}`);
      const data = await res.json();
      if (data.success && data.totalChaps) {
        setFormData(prev => {
          const updates = { totalChaps: data.totalChaps.toString() };
          // Nếu form hiện tại chưa có ảnh bìa, tự động điền ảnh bìa quét được
          if (data.coverUrl && !prev.coverUrl) {
            updates.coverUrl = data.coverUrl;
          }
          return { ...prev, ...updates };
        });
        showToast(`Quét thành công! Tìm thấy ${data.totalChaps} chap và ảnh bìa truyện.`, 'success');
      } else {
        showToast(data.error || 'Không tìm thấy thông tin trên trang này.', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi quét thông tin truyện.', 'danger');
    }
  };

  // Tự động quét và cập nhật riêng ảnh bìa từ link đọc
  const autoDetectCoverUrl = async () => {
    const url = formData.url;
    if (!url) {
      showToast('Vui lòng điền đường dẫn truyện hoặc dán link đọc để tự động quét ảnh bìa', 'info');
      return;
    }

    showToast('Đang quét tự động ảnh bìa...', 'info');
    try {
      const titleParam = formData.title ? `&title=${encodeURIComponent(formData.title)}` : '';
      const res = await fetch(`/api/get-total-chaps?url=${encodeURIComponent(url)}${titleParam}`);
      const data = await res.json();
      if (data.success) {
        if (data.coverUrl) {
          setFormData(prev => ({ ...prev, coverUrl: data.coverUrl }));
          showToast('Quét và cập nhật ảnh bìa thành công!', 'success');
        } else {
          showToast('Không tìm thấy ảnh bìa phù hợp trên trang này.', 'warning');
        }
      } else {
        showToast(data.error || 'Lỗi quét thông tin trang.', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối khi quét ảnh bìa.', 'danger');
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
      const res = await fetch(`/api/get-total-chaps?url=${encodeURIComponent(story.url)}&title=${encodeURIComponent(story.title)}`);
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

        // Tự động bổ sung ảnh bìa nếu DB chưa có
        if (data.coverUrl && !story.coverUrl) {
          patchBody.coverUrl = data.coverUrl;
        }

        // Chỉ gửi patch nếu có thay đổi
        if (patchBody.totalChaps !== undefined || patchBody.coverUrl !== undefined) {
          const patchRes = await fetch(`/api/stories/${story._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchBody)
          });

          const patchData = await patchRes.json();
          if (patchData.success) {
            // Xóa cache vì dữ liệu đã đổi
            searchCache.current.clear();
            // Cập nhật state cục bộ để giao diện tiến độ cập nhật ngay lập tức
            setStories(prev => prev.map(s => s._id === story._id ? {
              ...s,
              totalChaps: scannedTotal,
              coverUrl: patchBody.coverUrl !== undefined ? patchBody.coverUrl : s.coverUrl,
              lastScannedAt: patchBody.lastScannedAt
            } : s));
          }
        } else {
          // Cập nhật thời gian đã quét để không lặp lại quét liên tục
          await fetch(`/api/stories/${story._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastScannedAt: patchBody.lastScannedAt })
          });
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
  }, [page, debouncedSearchQuery, sortBy, filterProgress, filterStatus]);

  // Reset về trang 1 khi bộ lọc tiến độ hoặc trạng thái thay đổi
  useEffect(() => {
    setPage(1);
  }, [filterProgress, filterStatus]);

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
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setIsFilterDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Tải cấu hình domain từ database
  // Tải cấu hình domain và Cloudflare từ database
  useEffect(() => {
    const fetchDomain = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
          if (data.domain) setComicDomain(data.domain);
          if (data.cookie) setComicCookie(data.cookie);
          if (data.userAgent) setComicUserAgent(data.userAgent);
        }
      } catch (err) {
        console.error('Lỗi khi nạp cấu hình domain và Cloudflare:', err);
      }
    };
    fetchDomain();
  }, []);

  // Mở modal cấu hình domain và Cloudflare
  const openDomainModal = () => {
    setTempDomain(comicDomain);
    setTempCookie(comicCookie);
    setTempUserAgent(comicUserAgent);
    setIsDomainModalOpen(true);
  };

  // Lưu cấu hình domain và Cloudflare mới
  const handleSaveDomain = async (e) => {
    e.preventDefault();
    if (!tempDomain.trim()) return;

    setSaveDomainLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          domain: tempDomain.trim(),
          cookie: tempCookie.trim(),
          userAgent: tempUserAgent.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setComicDomain(tempDomain.trim());
        setComicCookie(tempCookie.trim());
        setComicUserAgent(tempUserAgent.trim());
        setIsDomainModalOpen(false);
        showToast('Đã lưu cấu hình cài đặt!');
      } else {
        showToast(data.error || 'Không thể lưu cài đặt', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi kết nối máy chủ', 'danger');
    } finally {
      setSaveDomainLoading(false);
    }
  };



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

  // Làm mới trang (clear cache và tải lại dữ liệu)
  const handleRefresh = async () => {
    searchCache.current.clear();
    scannedStoriesRef.current.clear();
    showToast('Đang làm mới danh sách...', 'info');
    await fetchStories();
  };

  // Gọi API lấy danh sách truyện (có phân trang)
  const fetchStories = async () => {
    const cacheKey = `${page}_${debouncedSearchQuery}_${sortBy}_${filterProgress}_${filterStatus}`;

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
      const activeStatus = debouncedSearchQuery ? '' : (filterStatus === 'all' ? '' : filterStatus);
      const activeProgress = debouncedSearchQuery ? 'all' : filterProgress;
      const res = await fetch(`/api/stories?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearchQuery)}&sort=${sortBy}&progress=${activeProgress}&status=${activeStatus}`);
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
    const cacheKey = `${p}_${debouncedSearchQuery}_${sortBy}_${filterProgress}_${filterStatus}`;
    if (searchCache.current.has(cacheKey)) return;

    try {
      const activeStatus = debouncedSearchQuery ? '' : (filterStatus === 'all' ? '' : filterStatus);
      const activeProgress = debouncedSearchQuery ? 'all' : filterProgress;
      const res = await fetch(`/api/stories?page=${p}&limit=${limit}&search=${encodeURIComponent(debouncedSearchQuery)}&sort=${sortBy}&progress=${activeProgress}&status=${activeStatus}`);
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

    // Chuẩn hóa URL theo domain:
    // - Domain chung (goctruyentranhvui30.com) → lưu relative path (hành vi cũ)
    // - Domain khác → giữ full URL
    const cleanUrl = normalizeStoryUrl(formData.url.trim(), getComicDomain());
    // Đảm bảo đường dẫn ảnh bìa được làm sạch
    const cleanCoverUrl = getRelativeCoverPath(formData.coverUrl);

    // Kiểm tra trùng lặp link trước khi lưu để cảnh báo
    if (cleanUrl) {
      const isDuplicateLink = stories.find(s => s.url && getRelativeStoryPath(s.url).toLowerCase() === cleanUrl.toLowerCase() && s._id !== selectedStory?._id);
      if (isDuplicateLink) {
        const confirmed = confirm(`Cảnh báo: Đường dẫn này đã được sử dụng cho truyện "${isDuplicateLink.title}". Bạn vẫn muốn tiếp tục lưu chứ?`);
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
            url: cleanUrl,
            coverUrl: cleanCoverUrl,
            rating: formData.rating,
            totalChaps: formData.totalChaps,
            status: formData.status || 'Reading'
          })
        });
      } else {
        res = await fetch(`/api/stories/${selectedStory._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            chap: formData.chap,
            url: cleanUrl,
            coverUrl: cleanCoverUrl,
            rating: formData.rating,
            totalChaps: formData.totalChaps,
            status: formData.status || 'Reading'
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

  // Trả về domain chung (fallback)
  const getComicDomain = () => {
    return (comicDomain || 'https://goctruyentranhvui30.com').replace(/\/$/, '');
  };

  // Lấy domain cho một truyện cụ thể:
  // Ưu tiên extract từ URL đầy đủ của truyện, fallback về domain chung
  const getStoryDomain = (story) => {
    const url = story?.url?.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
      } catch { }
    }
    return getComicDomain();
  };

  // Lấy prefix chương phù hợp với domain của truyện (chuong- hoặc chapter-)
  const getChapPrefix = (story) => {
    const storyDomain = getStoryDomain(story);
    const config = getDomainConfig(storyDomain);
    return config?.chapPrefix ?? 'chuong-';
  };

  // Sinh URL tuyệt đối đầy đủ cho ảnh bìa
  const getFullCoverUrl = (url, story) => {
    if (!url) return '';
    
    let absoluteUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const cleanPath = url.replace(/^\/|\/$/g, '');
      absoluteUrl = `${getStoryDomain(story)}/${cleanPath}`;
    }
    
    // Nếu là truyện thuộc hệ thống goctruyentranhvui, chuyển hướng qua proxy trên server để vượt CORP/Cloudflare
    const storyDomain = getStoryDomain(story);
    if (storyDomain && storyDomain.includes('goctruyentranhvui')) {
      return `/api/proxy-image?url=${encodeURIComponent(absoluteUrl)}`;
    }
    
    return absoluteUrl;
  };

  // Sinh URL cho chương hiện tại
  const getCurrentChapUrl = (url, currentChap, story) => {
    if (!url) return '';
    const num = parseFloat(currentChap);
    const currentChapStr = isNaN(num) ? currentChap : num.toString();
    const relativePath = getRelativeStoryPath(url);
    const domain = getStoryDomain(story);
    const prefix = getChapPrefix(story);
    return `${domain}/${relativePath}/${prefix}${currentChapStr}`;
  };

  // Sinh URL cho chương tiếp theo
  const getNextChapUrl = (url, currentChap, story) => {
    if (!url) return '';
    const num = parseFloat(currentChap);
    const nextChap = isNaN(num) ? currentChap : (num + 1).toString();
    const relativePath = getRelativeStoryPath(url);
    const domain = getStoryDomain(story);
    const prefix = getChapPrefix(story);
    return `${domain}/${relativePath}/${prefix}${nextChap}`;
  };

  // Sao chép link chương tiếp theo
  const handleCopyLink = (story) => {
    const nextUrl = getNextChapUrl(story.url, story.chap, story);
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
      totalChaps: story.totalChaps ? story.totalChaps.toString() : '',
      status: story.status || 'Reading'
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
      totalChaps: '',
      status: 'Reading'
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
        <h1
          className="brand-title"
          onClick={() => {
            setSearchQuery('');
            setFilterProgress('incomplete');
            setSortBy('updatedAt_desc');
            setPage(1);
            searchCache.current.clear();
          }}
          style={{ cursor: 'pointer' }}
          title="Click để về trang chủ"
        >
          <BookOpen size={30} style={{ color: 'var(--primary-color)' }} />
          <span>Quản lý Truyện Đã Đọc</span>
        </h1>
        <div className="controls-group">
          <button className="btn btn-outline" onClick={handleRefresh} disabled={loading} title="Làm mới trang">
            <RefreshCw size={16} className={loading ? "spin-animation" : ""} />
            <span>Làm mới</span>
          </button>
          <button className="btn btn-outline" onClick={openDomainModal} title="Cấu hình Domain truyện">
            <Globe size={16} />
            <span>Cấu hình Domain</span>
          </button>
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

          {/* Custom Select dropdown (Combobox) - Sắp xếp */}
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

          {/* Dropdown bộ lọc tiến độ đọc */}
          <div className="custom-select-wrapper" ref={filterDropdownRef}>
            <button
              type="button"
              className={`custom-select-trigger ${filterProgress !== 'all' ? 'filter-active' : ''}`}
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            >
              <span>
                {filterProgress === 'all' && 'Tiến độ: Tất cả'}
                {filterProgress === 'complete' && 'Đọc 100%'}
                {filterProgress === 'incomplete' && 'Chưa 100%'}
              </span>
              <ChevronDown size={16} className={`arrow-icon ${isFilterDropdownOpen ? 'open' : ''}`} />
            </button>
            {isFilterDropdownOpen && (
              <div className="custom-select-options">
                {[
                  { value: 'all', label: 'Tiến độ: Tất cả' },
                  { value: 'complete', label: 'Đọc 100%' },
                  { value: 'incomplete', label: 'Chưa 100%' }
                ].map(opt => (
                  <div
                    key={opt.value}
                    className={`custom-select-option ${filterProgress === opt.value ? 'selected' : ''}`}
                    onClick={() => {
                      setFilterProgress(opt.value);
                      setIsFilterDropdownOpen(false);
                      searchCache.current.clear();
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown bộ lọc trạng thái truyện */}
          <div className="custom-select-wrapper" ref={statusDropdownRef}>
            <button
              type="button"
              className={`custom-select-trigger ${filterStatus !== 'all' ? 'filter-active' : ''}`}
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
            >
              <span>
                {filterStatus === 'all' && 'Trạng thái: Tất cả'}
                {filterStatus !== 'all' && (storyStatuses.find(s => s.value === filterStatus)?.label || filterStatus)}
              </span>
              <ChevronDown size={16} className={`arrow-icon ${isStatusDropdownOpen ? 'open' : ''}`} />
            </button>
            {isStatusDropdownOpen && (
              <div className="custom-select-options">
                <div
                  className={`custom-select-option ${filterStatus === 'all' ? 'selected' : ''}`}
                  onClick={() => {
                    setFilterStatus('all');
                    setIsStatusDropdownOpen(false);
                    searchCache.current.clear();
                  }}
                >
                  Trạng thái: Tất cả
                </div>
                {storyStatuses.map(st => (
                  <div
                    key={st.value}
                    className={`custom-select-option ${filterStatus === st.value ? 'selected' : ''}`}
                    onClick={() => {
                      setFilterStatus(st.value);
                      setIsStatusDropdownOpen(false);
                      searchCache.current.clear();
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: st.color, display: 'inline-block', flexShrink: 0 }} />
                    {st.label}
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
              const currentUrl = getCurrentChapUrl(story.url, story.chap, story);
              const nextUrl = getNextChapUrl(story.url, story.chap, story);
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
                          src={getFullCoverUrl(story.coverUrl, story)}
                          alt={story.title}
                          className="card-thumb"
                          onClick={() => window.open(getFullCoverUrl(story.coverUrl, story), '_blank')}
                          title="Click để phóng to ảnh bìa"
                        />
                      ) : (
                        <div className="card-thumb" title="Chưa có ảnh bìa">
                          📖
                        </div>
                      )}

                    </div>
                    <div className="card-details">
                      <h4 className="card-title-v2" title={story.title} style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>{story.title}</h4>

                      {/* Hàng: Sao đánh giá + Badge trạng thái */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0', flexWrap: 'wrap' }}>
                        <div className="card-rating-stars" title={`Đánh giá: ${story.rating || 0}/5 sao`} style={{ display: 'flex', gap: '2px' }}>
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
                        {(() => {
                          const st = storyStatuses.find(s => s.value === (story.status || 'Reading'));
                          return (
                            <span style={{
                              display: 'inline-block',
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '1px 7px',
                              borderRadius: '20px',
                              backgroundColor: st ? st.color + '22' : '#6366f122',
                              color: st ? st.color : '#6366f1',
                              border: `1px solid ${st ? st.color + '55' : '#6366f155'}`,
                              letterSpacing: '0.3px',
                              whiteSpace: 'nowrap'
                            }}>
                              {st ? st.label : 'Đang đọc'}
                            </span>
                          );
                        })()}
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
                          className="inline-chap-input"
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

              <div className="form-row-2col">
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
                  <label className="form-label">Tổng Số Chap</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="form-control"
                      placeholder="Tổng số chương..."
                      value={formData.totalChaps}
                      onChange={(e) => setFormData({ ...formData, totalChaps: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => autoDetectTotalChaps()}
                      title="Tự động quét số chap từ link đọc"
                      style={{ padding: '0 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
                    >
                      Quét
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Đường Dẫn / Link Truyện</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Dán link đầy đủ (ví dụ: https://truyenqq.com.vn/ten-truyen) hoặc đường dẫn tương đối..."
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
                <label className="form-label">Đường Dẫn / Link Ảnh Bìa</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Dán link hoặc nhập đường dẫn ảnh bìa tương đối (ví dụ: wp-content/uploads/...)..."
                    value={formData.coverUrl}
                    onChange={(e) => setFormData({ ...formData, coverUrl: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => autoDetectCoverUrl()}
                    title="Tự động quét ảnh bìa từ link đọc"
                    style={{ padding: '0 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    Quét
                  </button>
                </div>
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

              <div className="form-group">
                <label className="form-label">Trạng Thái Truyện</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {storyStatuses.map(st => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, status: st.value })}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: `1.5px solid ${st.color}`,
                        backgroundColor: formData.status === st.value ? st.color : 'transparent',
                        color: formData.status === st.value ? '#fff' : st.color,
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
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

      {/* Modal Cấu hình Domain & Cloudflare */}
      {isDomainModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">⚙️ Cấu Hình Hệ Thống</h3>
              <button className="btn-icon" onClick={() => setIsDomainModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDomain}>
              <div className="form-group">
                <label className="form-label">Domain Truyện Tranh Dùng Chung</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ví dụ: https://goctruyentranhvui30.com"
                  value={tempDomain}
                  onChange={(e) => setTempDomain(e.target.value)}
                  required
                />
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.4' }}>
                  Domain này dùng để tự động tạo link đọc cho các truyện chỉ lưu đường dẫn tương đối (ví dụ: <code>truyen/tuyet-the-quan-lam</code>).
                </small>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Cloudflare Cookie (cf_clearance) <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Tùy chọn)</span></label>
                <textarea
                  className="form-control"
                  style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder="Ví dụ: cf_clearance=abcd1234..."
                  value={tempCookie}
                  onChange={(e) => setTempCookie(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.4' }}>
                  Lấy từ tab Cookie trên trình duyệt khi truy cập trang truyện (để vượt mã xác minh Cloudflare).
                </small>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">User-Agent Trình Duyệt <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Tùy chọn)</span></label>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder="Mozilla/5.0..."
                  value={tempUserAgent}
                  onChange={(e) => setTempUserAgent(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.4' }}>
                  User-Agent phải khớp với trình duyệt bạn lấy Cookie.
                </small>
              </div>

              <div className="form-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsDomainModalOpen(false)}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saveDomainLoading}>
                  {saveDomainLoading ? 'Đang lưu...' : 'Lưu Cài Đặt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
