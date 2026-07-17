import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    if (!imageUrl) {
      return new Response('URL is required', { status: 400 });
    }

    const db = await getDb();
    const settings = await db.collection('settings').find({
      key: { $in: ['comic_cookie', 'comic_user_agent'] }
    }).toArray();
    
    const cookieSetting = settings.find(s => s.key === 'comic_cookie');
    const uaSetting = settings.find(s => s.key === 'comic_user_agent');

    const cleanUa = (uaSetting?.value || '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
      
    const headers = {
      'User-Agent': cleanUa || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    
    if (cookieSetting?.value) {
      let cleanCookie = cookieSetting.value.trim().replace(/^['"]|['"]$/g, '');
      if (cleanCookie && !cleanCookie.startsWith('cf_clearance=')) {
        cleanCookie = `cf_clearance=${cleanCookie}`;
      }
      headers['Cookie'] = cleanCookie;
    }

    // Thiết lập timeout 8 giây
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status}`, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'public, max-age=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(buffer, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Lỗi khi proxy ảnh:', error.message);
    return new Response(error.message, { status: 500 });
  }
}
