import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// API Lấy cấu hình dùng chung (domain, cookie, user_agent)
export async function GET() {
  try {
    const db = await getDb();
    const settings = await db.collection('settings').find({
      key: { $in: ['comic_domain', 'comic_cookie', 'comic_user_agent'] }
    }).toArray();

    const domainSetting = settings.find(s => s.key === 'comic_domain');
    const cookieSetting = settings.find(s => s.key === 'comic_cookie');
    const uaSetting = settings.find(s => s.key === 'comic_user_agent');

    const domain = domainSetting ? domainSetting.value : (process.env.NEXT_PUBLIC_COMIC_DOMAIN || 'https://goctruyentranhvui30.com');
    const cookie = cookieSetting ? cookieSetting.value : '';
    const userAgent = uaSetting ? uaSetting.value : '';

    return NextResponse.json({ success: true, domain, cookie, userAgent });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// API Lưu cấu hình dùng chung
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain, cookie, userAgent } = body;
    if (!domain) {
      return NextResponse.json({ success: false, error: 'Domain không được để trống' }, { status: 400 });
    }
    
    const db = await getDb();
    
    // Lưu domain
    await db.collection('settings').updateOne(
      { key: 'comic_domain' },
      { $set: { value: domain.trim(), updatedAt: new Date() } },
      { upsert: true }
    );

    // Lưu cookie (nếu có truyền lên)
    if (cookie !== undefined) {
      await db.collection('settings').updateOne(
        { key: 'comic_cookie' },
        { $set: { value: cookie.trim(), updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Lưu userAgent (nếu có truyền lên)
    if (userAgent !== undefined) {
      await db.collection('settings').updateOne(
        { key: 'comic_user_agent' },
        { $set: { value: userAgent.trim(), updatedAt: new Date() } },
        { upsert: true }
      );
    }
    
    return NextResponse.json({ success: true, message: 'Cập nhật cấu hình thành công' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
