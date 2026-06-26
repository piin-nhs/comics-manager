import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import * as XLSX from 'xlsx';

// API xử lý việc tải lên file Excel (.xlsx hoặc .csv) trực tiếp từ giao diện Web
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy file tải lên.' }, { status: 400 });
    }
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Đọc workbook từ file buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Lấy sheet đầu tiên
    const sheet = workbook.Sheets[sheetName];
    
    // Chuyển sheet thành mảng 2 chiều
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rawData.length < 2) {
      return NextResponse.json({ success: false, error: 'File Excel trống hoặc thiếu dòng tiêu đề.' }, { status: 400 });
    }
    
    // Đọc tiêu đề dòng 0
    const headers = rawData[0].map(h => (h || '').toString().trim().toLowerCase());
    
    // Tự động phát hiện chỉ số cột Tên truyện và Số chap
    const titleIndex = headers.findIndex(h => 
      h.includes('truyện') || h.includes('tên') || h.includes('title') || h.includes('comic') || h.includes('story')
    );
    
    const chapIndex = headers.findIndex(h => 
      h.includes('chap') || h.includes('chương') || h.includes('chapter') || h.includes('đọc')
    );
    
    // Mặc định cột 0 là Tên truyện, cột 1 là Số chap nếu không phát hiện được tiêu đề
    const finalTitleIndex = titleIndex !== -1 ? titleIndex : 0;
    const finalChapIndex = chapIndex !== -1 ? chapIndex : 1;
    
    const db = await getDb();
    const collection = db.collection('stories');
    
    let successCount = 0;
    let updateCount = 0;
    
    // Duyệt qua từng hàng dữ liệu (bắt đầu từ dòng 1)
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;
      
      const title = (row[finalTitleIndex] || '').toString().trim();
      const chap = (row[finalChapIndex] || '0').toString().trim();
      
      if (!title) continue;
      
      // Upsert: Kiểm tra sự tồn tại của truyện theo tên (không phân biệt chữ hoa/thường)
      const existing = await collection.findOne({
        title: { $regex: `^${escapeRegExp(title)}$`, $options: 'i' }
      });
      
      if (existing) {
        // Cập nhật chap mới nếu truyện đã tồn tại
        await collection.updateOne(
          { _id: existing._id },
          { 
            $set: { 
              chap: chap,
              updatedAt: new Date()
            } 
          }
        );
        updateCount++;
      } else {
        // Thêm truyện mới
        await collection.insertOne({
          title: title,
          chap: chap,
          status: 'Reading', // Mặc định là Đang đọc
          url: '',
          coverUrl: '',
          rating: 0,
          notes: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        successCount++;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Đã xử lý file thành công! Đã thêm mới ${successCount} truyện và cập nhật ${updateCount} truyện vào database.` 
    });
  } catch (error) {
    console.error('Error importing Excel:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
