import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// API Lấy cấu hình dùng chung (domain)
export async function GET() {
  try {
    const db = await getDb();
    const setting = await db.collection('settings').findOne({ key: 'comic_domain' });

    const domain = setting ? setting.value : (process.env.NEXT_PUBLIC_COMIC_DOMAIN || 'https://goctruyentranhvui30.com');

    return NextResponse.json({ success: true, domain });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// API Lưu cấu hình dùng chung (domain)
export async function POST(request) {
  try {
    const body = await request.json();
    const { domain } = body;
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
    
    return NextResponse.json({ success: true, message: 'Cập nhật cấu hình thành công' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
