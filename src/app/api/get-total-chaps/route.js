import { NextResponse } from 'next/server';

const getMainPageUrl = (url) => {
  if (!url) return '';
  // Cắt bỏ phần chương ở cuối URL để lấy link trang truyện chính (ví dụ: .../chuong-46 -> ..., .../chuong-240.html -> ...)
  const regex = /\/(chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\d+(\.\d+)?)(?:\.[a-zA-Z0-9]+)?(?=\/*$|[?#]|\/)/i;
  const match = url.match(regex);
  if (match) {
    const lastIndex = url.lastIndexOf(match[0]);
    if (lastIndex !== -1) {
      return url.substring(0, lastIndex);
    }
  }
  return url;
};

// Cache lưu tổng số chương của truyện (key: mainPageUrl, value: { totalChaps: number, timestamp: number })
// Tránh spam quét nhiều lần vào các trang truyện, tăng tốc tải trang
const scrapeCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 phút cache

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const mainPageUrl = getMainPageUrl(url);
    if (!mainPageUrl) {
      return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
    }

    // Kiểm tra cache trước
    const now = Date.now();
    const cached = scrapeCache.get(mainPageUrl);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json({
        success: true,
        totalChaps: cached.totalChaps,
        mainPageUrl,
        fromCache: true
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 giây timeout

    const response = await fetch(mainPageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status < 200 || response.status >= 300) {
      return NextResponse.json({ success: false, error: `Failed to fetch main page (Status: ${response.status})` });
    }

    const html = await response.text();

    // Lấy phần đường dẫn của trang chính (ví dụ: /truyen/menh-luan-chi-chu...)
    let urlPath = '';
    try {
      urlPath = new URL(mainPageUrl).pathname.replace(/\/$/, '');
    } catch (e) {
      const match = mainPageUrl.match(/https?:\/\/[^\/]+(\/[^?#]+)/);
      urlPath = match ? match[1].replace(/\/$/, '') : '';
    }

    const chaps = [];
    let match;

    if (urlPath && urlPath.length > 5) {
      // 1. Quét chính xác: Chỉ tìm các liên kết chứa đường dẫn của truyện này kèm từ khóa chương
      const escapedPath = urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const storyRegex = new RegExp(`${escapedPath}[^"'>]*?(?:chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\\d+(\\.\\d+)?)`, 'gi');
      
      while ((match = storyRegex.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
          chaps.push(num);
        }
      }
    }

    // 2. Quét dự phòng (Fallback): Nếu không quét được theo đường dẫn riêng, quét toàn bộ từ khóa chương trong trang
    if (chaps.length === 0) {
      const genericRegex = /(?:chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\d+(\.\d+)?)/gi;
      while ((match = genericRegex.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
          chaps.push(num);
        }
      }
    }

    // 3. Quét dự phòng cuối cùng: Chỉ tìm số đứng sau dấu gạch chéo cuối
    if (chaps.length === 0) {
      const fallbackRegex = /\/(\d+(\.\d+)?)(?=\/*$|[?#])/g;
      while ((match = fallbackRegex.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
          chaps.push(num);
        }
      }
    }

    if (chaps.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy chương nào trong HTML' });
    }

    // Lấy số chương lớn nhất làm tổng số chương
    const maxChap = Math.max(...chaps);

    // Lưu kết quả vào cache
    scrapeCache.set(mainPageUrl, { totalChaps: maxChap, timestamp: Date.now() });

    return NextResponse.json({
      success: true,
      totalChaps: maxChap,
      mainPageUrl
    });
  } catch (error) {
    console.error('Error fetching total chapters:', error.message);
    return NextResponse.json({ success: false, error: error.message });
  }
}
