import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    // Thiết lập timeout 4 giây để không treo kết nối quá lâu
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Phân loại mã trạng thái trả về
    let code = 'unknown';
    if (response.status >= 200 && response.status < 300) {
      code = 'ok';
    } else if (response.status === 404) {
      code = 'not_found';
    } else if (response.status === 403 || response.status === 503) {
      code = 'blocked';
    } else {
      code = 'error';
    }

    return NextResponse.json({
      success: true,
      exists: code === 'ok',
      code,
      status: response.status
    });
  } catch (error) {
    console.error('Lỗi khi kiểm tra link chương mới:', error.message);
    return NextResponse.json({
      success: true,
      exists: false,
      code: 'failed',
      error: error.message
    });
  }
}
