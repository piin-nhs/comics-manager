const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Đọc thủ công file .env.local để lấy thông tin kết nối database
if (!process.env.MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const eqIdx = trimmed.indexOf('=');
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.error('Không thể tự động đọc file .env.local:', e);
  }
}

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

// Hàm trích xuất đường dẫn tương đối của ảnh bìa truyện
const getRelativeCoverPath = (url) => {
  if (!url) return '';
  let path = url.trim();
  
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path);
      const externalHosts = ['imgur.com', 'blogspot.com', 'googleusercontent.com', 'ggpht.com', 'cloudinary.com', 'wp.com'];
      const isExternal = externalHosts.some(host => parsed.hostname.includes(host));
      if (!isExternal) {
        path = parsed.pathname + parsed.search; // Giữ lại phần query params (ví dụ: ?code=gtt-yes)
      }
    } catch (e) {
      console.error("Error parsing cover URL:", e);
    }
  }
  
  return path.startsWith('http://') || path.startsWith('https://') ? path : path.replace(/^\/|\/$/g, '');
};

async function standardize() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\n❌ LỖI: Chưa cấu hình MONGODB_URI trong file .env.local.');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || 'comics_db';
  console.log('🔌 Đang kết nối đến MongoDB Atlas...');
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Kết nối cơ sở dữ liệu thành công!');
    const db = client.db(dbName);
    const collection = db.collection('stories');

    const stories = await collection.find({}).toArray();
    console.log(`🔍 Tìm thấy ${stories.length} truyện trong database.`);
    
    let updatedCount = 0;
    
    for (const story of stories) {
      const oldUrl = story.url || '';
      const oldCover = story.coverUrl || '';
      
      const newUrl = getRelativeStoryPath(oldUrl);
      let newCover = getRelativeCoverPath(oldCover);

      // Khôi phục lại query param ?code=gtt-yes cho ảnh bìa gốc của trang truyện nếu bị thiếu
      if (newCover && newCover.startsWith('image/') && !newCover.includes('?')) {
        newCover += '?code=gtt-yes';
      }
      
      if (newUrl !== oldUrl || newCover !== oldCover) {
        console.log(`📝 Chuẩn hóa "${story.title}":`);
        if (newUrl !== oldUrl) {
          console.log(`   - Link đọc: "${oldUrl}" -> "${newUrl}"`);
        }
        if (newCover !== oldCover) {
          console.log(`   - Ảnh bìa:  "${oldCover}" -> "${newCover}"`);
        }
        
        await collection.updateOne(
          { _id: story._id },
          { 
            $set: { 
              url: newUrl, 
              coverUrl: newCover,
              updatedAt: new Date()
            } 
          }
        );
        updatedCount++;
      }
    }

    console.log(`\n🎉 CHUẨN HÓA HOÀN TẤT!`);
    console.log(`- Đã cập nhật chuẩn hóa: ${updatedCount} bộ truyện.`);
    console.log(`- Các truyện khác đã ở định dạng chuẩn.`);

  } catch (error) {
    console.error('❌ Đã xảy ra lỗi trong quá trình chuẩn hóa:', error);
  } finally {
    await client.close();
    console.log('🔌 Đã đóng kết nối cơ sở dữ liệu.');
  }
}

standardize();
