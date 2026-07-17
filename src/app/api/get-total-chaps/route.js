import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// Hàm trích xuất đường dẫn tương đối của truyện (ví dụ: truyen/tuyet-the-quan-lam)
const getRelativeStoryPath = (url) => {
  if (!url) return '';
  let path = url.trim();
  
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path);
      path = parsed.pathname;
    } catch (e) {
      console.error("Error parsing URL:", e);
    }
  }
  
  const regex = /\/(chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\d+(\.\d+)?)(?:\.[a-zA-Z0-9]+)?(?=\/*$|[?#]|\/)/i;
  const match = path.match(regex);
  if (match) {
    const lastIndex = path.lastIndexOf(match[0]);
    if (lastIndex !== -1) {
      path = path.substring(0, lastIndex);
    }
  }
  
  return path.replace(/^\/|\/$/g, '');
};

// Hàm trích xuất đường dẫn ảnh bìa truyện
// - URL tuyệt đối (http/https): giữ nguyên để không mất domain gốc
// - URL tương đối (/path/...): loại bỏ dấu gạch chéo đầu/cuối
const getRelativeCoverPath = (url) => {
  if (!url) return '';
  const path = url.trim();

  // Nếu là URL tuyệt đối (kể cả ảnh từ CDN ngoài), giữ nguyên toàn bộ
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Đường dẫn tương đối: bỏ dấu / đầu và cuối
  return path.replace(/^\/|\/$/g, '');
};


// Hàm quét ảnh bìa từ nội dung HTML của trang truyện chính
const getCoverFromHtml = (html, title) => {
  // 1. Tìm trong meta tag og:image (phổ biến nhất và chuẩn SEO)
  const ogImageRegex = /<meta\s+[^>]*property=["']og:image["']\s+[^>]*content=["']([^"']+)["']/i;
  let match = html.match(ogImageRegex);
  if (match && match[1]) return match[1];
  
  const ogImageRegex2 = /<meta\s+[^>]*content=["']([^"']+)["']\s+[^>]*property=["']og:image["']/i;
  match = html.match(ogImageRegex2);
  if (match && match[1]) return match[1];

  // 2. Tìm thẻ img có alt hoặc title chứa tên truyện tranh chính xác
  if (title) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // img tag có src đứng trước alt/title
    const imgRegex = new RegExp(`<img\\s+[^>]*src=["']([^"']+)["'][^>]*?(?:alt|title)=["'][^"']*?${escapedTitle}[^"']*?["']`, 'i');
    match = html.match(imgRegex);
    if (match && match[1]) return match[1];
    
    // img tag có alt/title đứng trước src
    const imgRegex2 = new RegExp(`<img\\s+[^>]*?(?:alt|title)=["'][^"']*?${escapedTitle}[^"']*?["'][^>]*src=["']([^"']+)["']`, 'i');
    match = html.match(imgRegex2);
    if (match && match[1]) return match[1];
  }

  // 3. Tìm thẻ img có class chứa các từ khóa ảnh bìa/ảnh đại diện làm dự phòng
  const coverRegex = /<img\s+[^>]*class=["'][^"']*(?:cover|image|thumb|avatar)[^"']*["'][^>]*src=["']([^"']+)["']/i;
  match = html.match(coverRegex);
  if (match && match[1]) return match[1];

  const coverRegex2 = /<img\s+[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*(?:cover|image|thumb|avatar)[^"']*["']/i;
  match = html.match(coverRegex2);
  if (match && match[1]) return match[1];

  return null;
};

// Cache lưu tổng số chương & ảnh bìa của truyện (key: resolvedUrl, value: { totalChaps, coverUrl, timestamp })
const scrapeCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 phút cache

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const title = searchParams.get('title') || '';
    
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    // Lấy domain và cấu hình Cloudflare từ database
    const db = await getDb();
    const settings = await db.collection('settings').find({
      key: { $in: ['comic_domain', 'comic_cookie', 'comic_user_agent'] }
    }).toArray();

    const domainSetting = settings.find(s => s.key === 'comic_domain');
    const cookieSetting = settings.find(s => s.key === 'comic_cookie');
    const uaSetting = settings.find(s => s.key === 'comic_user_agent');

    const domain = domainSetting ? domainSetting.value : (process.env.NEXT_PUBLIC_COMIC_DOMAIN || 'https://goctruyentranhvui30.com');
    const cleanDomain = domain.replace(/\/$/, '');

    // Phân giải đường dẫn tương đối
    const relativePath = getRelativeStoryPath(url);
    if (!relativePath) {
      return NextResponse.json({ success: false, error: 'Invalid URL/Path' }, { status: 400 });
    }

    // Nếu URL gốc đã là URL đầy đủ → extract domain từ đó, không dùng domain chung
    let resolvedUrl;
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      try {
        const parsed = new URL(trimmedUrl);
        resolvedUrl = `${parsed.protocol}//${parsed.host}/${relativePath}`;
      } catch {
        resolvedUrl = `${cleanDomain}/${relativePath}`;
      }
    } else {
      resolvedUrl = `${cleanDomain}/${relativePath}`;
    }

    // Kiểm tra cache trước
    const now = Date.now();
    const cached = scrapeCache.get(resolvedUrl);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      return NextResponse.json({
        success: true,
        totalChaps: cached.totalChaps,
        coverUrl: cached.coverUrl,
        mainPageUrl: resolvedUrl,
        fromCache: true
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 giây timeout

    const cleanUa = (uaSetting?.value || '')
      .trim()
      .replace(/^['"]|['"]$/g, '');

    const headers = {
      'User-Agent': cleanUa || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    
    if (cookieSetting?.value) {
      let cleanCookie = cookieSetting.value.trim().replace(/^['"]|['"]$/g, '');
      if (cleanCookie && !cleanCookie.startsWith('cf_clearance=')) {
        cleanCookie = `cf_clearance=${cleanCookie}`;
      }
      headers['Cookie'] = cleanCookie;
    }

    const response = await fetch(resolvedUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status < 200 || response.status >= 300) {
      return NextResponse.json({ success: false, error: `Failed to fetch main page (Status: ${response.status})` });
    }

    const html = await response.text();

    // 1. Quét tìm tổng số chương
    let urlPath = `/${relativePath}`;
    const chaps = [];
    let match;

    if (urlPath && urlPath.length > 5) {
      // Quét chính xác theo đường dẫn của truyện tranh
      const escapedPath = urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const storyRegex = new RegExp(`${escapedPath}[^"'>]*?(?:chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\\d+(\\.\\d+)?)`, 'gi');
      
      while ((match = storyRegex.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
          chaps.push(num);
        }
      }
    }

    // Quét dự phòng (Fallback 1)
    if (chaps.length === 0) {
      const genericRegex = /(?:chuong|chap|chapter|c|vol|tập|tap|episode|ep)[-_]*(\d+(\.\d+)?)/gi;
      while ((match = genericRegex.exec(html)) !== null) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) {
          chaps.push(num);
        }
      }
    }

    // Quét dự phòng cuối cùng (Fallback 2)
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

    const maxChap = Math.max(...chaps);

    // 2. Quét tìm ảnh bìa truyện từ HTML
    let coverUrl = getCoverFromHtml(html, title);
    if (coverUrl) {
      coverUrl = getRelativeCoverPath(coverUrl);
    }

    // Lưu kết quả vào cache
    scrapeCache.set(resolvedUrl, { totalChaps: maxChap, coverUrl, timestamp: Date.now() });

    return NextResponse.json({
      success: true,
      totalChaps: maxChap,
      coverUrl,
      mainPageUrl: resolvedUrl
    });
  } catch (error) {
    console.error('Error fetching total chapters & cover:', error.message);
    return NextResponse.json({ success: false, error: error.message });
  }
}
