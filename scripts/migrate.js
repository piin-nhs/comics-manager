const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const XLSX = require('xlsx');

// Hàm bổ trợ escape regex char
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function migrate() {
  // Tìm đường dẫn thư mục cá nhân của user Windows
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\skyga';
  const defaultPath = path.join(userHome, 'Downloads', 'TruyệnTranh.xlsx');
  
  // Cho phép truyền đường dẫn tùy ý thông qua tham số dòng lệnh
  let filePath = process.argv[2] || defaultPath;
  
  console.log(`Đang kiểm tra file Excel dữ liệu cũ tại: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    // Nếu không tìm thấy ở thư mục Downloads, tìm thử ở thư mục dự án hiện tại
    const localPath = path.join(__dirname, '..', 'TruyệnTranh.xlsx');
    console.log(`Không tìm thấy file Excel tại Downloads. Đang thử tìm tại thư mục dự án: ${localPath}`);
    
    if (fs.existsSync(localPath)) {
      filePath = localPath;
    } else {
      console.error(`\n❌ LỖI: Không tìm thấy file Excel tại "${filePath}" hoặc "${localPath}".`);
      console.log('👉 HƯỚNG DẪN: Bạn hãy copy file "TruyệnTranh.xlsx" của bạn vào thư mục dự án này hoặc kéo thả file Excel trực tiếp trên giao diện Web để import nhé!');
      process.exit(1);
    }
  }

  // Đọc URI từ .env.local nếu chạy bằng lệnh node --env-file
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\n❌ LỖI: Chưa cấu hình MONGODB_URI trong file .env.local hoặc biến môi trường.');
    console.log('Vui lòng kiểm tra lại file .env.local của dự án.');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || 'comics_db';
  console.log('\n🔌 Đang kết nối đến MongoDB Atlas...');
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Kết nối cơ sở dữ liệu thành công!');
    const db = client.db(dbName);
    const collection = db.collection('stories');

    console.log(`📂 Đang đọc dữ liệu từ file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Chuyển sheet thành mảng 2 chiều
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rawData.length < 2) {
      console.error('❌ LỖI: File Excel không có dữ liệu hoặc thiếu dòng tiêu đề.');
      process.exit(1);
    }

    // Đọc dòng tiêu đề (dòng 0)
    const headers = rawData[0].map(h => (h || '').toString().trim().toLowerCase());
    
    // Tự động phát hiện tiêu đề cột
    const titleIndex = headers.findIndex(h => 
      h.includes('truyện') || h.includes('tên') || h.includes('title') || h.includes('comic') || h.includes('story')
    );
    const chapIndex = headers.findIndex(h => 
      h.includes('chap') || h.includes('chương') || h.includes('chapter') || h.includes('đọc')
    );

    const finalTitleIndex = titleIndex !== -1 ? titleIndex : 0;
    const finalChapIndex = chapIndex !== -1 ? chapIndex : 1;

    console.log(`🔍 Phát hiện cột dữ liệu: Cột Tên truyện (Cột ${finalTitleIndex + 1}), Cột Số chap đã đọc (Cột ${finalChapIndex + 1})`);

    let successCount = 0;
    let updateCount = 0;

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const title = (row[finalTitleIndex] || '').toString().trim();
      const chap = (row[finalChapIndex] || '0').toString().trim();

      if (!title) continue;

      // Kiểm tra xem truyện đã tồn tại trong database chưa (không phân biệt chữ hoa/thường)
      const existing = await collection.findOne({
        title: { $regex: `^${escapeRegExp(title)}$`, $options: 'i' }
      });

      if (existing) {
        // Cập nhật chap truyện
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
          status: 'Reading',
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

    console.log(`\n🎉 HỢP NHẤT DỮ LIỆU THÀNH CÔNG!`);
    console.log(`- Thêm truyện mới: ${successCount} bộ`);
    console.log(`- Cập nhật số chap đã đọc: ${updateCount} bộ`);
    console.log(`- Tổng số bản ghi đã xử lý: ${successCount + updateCount} bộ`);

  } catch (error) {
    console.error('❌ Đã xảy ra lỗi trong quá trình di cư:', error);
  } finally {
    await client.close();
    console.log('🔌 Đã đóng kết nối cơ sở dữ liệu.');
  }
}

migrate();
