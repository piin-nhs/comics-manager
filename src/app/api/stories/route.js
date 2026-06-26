import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// API Lấy danh sách truyện (có tìm kiếm, lọc trạng thái, sắp xếp)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'updatedAt_desc';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    const db = await getDb();
    
    // Xây dựng điều kiện tìm kiếm
    const query = {};
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }
    
    // Xây dựng điều kiện sắp xếp
    let sortQuery = { updatedAt: -1 };
    if (sort === 'title_asc') sortQuery = { title: 1 };
    else if (sort === 'title_desc') sortQuery = { title: -1 };
    else if (sort === 'updatedAt_asc') sortQuery = { updatedAt: 1 };
    else if (sort === 'updatedAt_desc') sortQuery = { updatedAt: -1 };
    else if (sort === 'chap_desc') {
      // Vì chap có thể chứa ký tự, ta lấy sắp xếp theo chiều giảm dần của ngày cập nhật làm phụ trợ
      sortQuery = { updatedAt: -1 };
    }
    
    const stories = await db.collection('stories').find(query).sort(sortQuery).toArray();
    
    // Nếu sort là 'chap_desc', ta thực hiện sort bằng javascript trên RAM để xử lý việc so sánh số có dấu phẩy (như 10.5) một cách chuẩn xác hơn
    if (sort === 'chap_desc') {
      stories.sort((a, b) => {
        const numA = parseFloat((a.chap || '').replace(/[^0-9.]/g, '')) || 0;
        const numB = parseFloat((b.chap || '').replace(/[^0-9.]/g, '')) || 0;
        return numB - numA;
      });
    }
    
    // Tính tổng số chương đã đọc của tất cả truyện (không phân trang)
    const totalChapsRead = stories.reduce((sum, s) => {
      const val = parseFloat(s.chap);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    // Phân trang bằng javascript
    const totalCount = stories.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const paginatedStories = stories.slice(startIndex, startIndex + limit);
    
    return NextResponse.json({ 
      success: true, 
      data: paginatedStories,
      pagination: {
        total: totalCount,
        totalPages,
        currentPage: page,
        limit,
        totalChapsRead: Math.round(totalChapsRead * 10) / 10
      }
    });
  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// API Thêm mới hoặc Cập nhật truyện (Upsert theo Title)
export async function POST(request) {
  try {
    const body = await request.json();
    const { title, chap, status, url, coverUrl, rating, notes, totalChaps } = body;
    
    if (!title) {
      return NextResponse.json({ success: false, error: 'Tên truyện không được để trống' }, { status: 400 });
    }
    
    const db = await getDb();
    
    // Chuẩn hóa dữ liệu đầu vào
    const storyData = {
      title: title.trim(),
      chap: (chap || '0').toString().trim(),
      status: status || 'Reading',
      url: (url || '').trim(),
      coverUrl: (coverUrl || '').trim(),
      rating: Number(rating) || 0,
      notes: (notes || '').trim(),
      totalChaps: Number(totalChaps) || 0,
      updatedAt: new Date()
    };
    
    // Tìm kiếm truyện theo tên (không phân biệt chữ hoa/chữ thường)
    const existingStory = await db.collection('stories').findOne({
      title: { $regex: `^${escapeRegExp(storyData.title)}$`, $options: 'i' }
    });
    
    if (existingStory) {
      // Cập nhật truyện đã tồn tại
      const updateData = {
        chap: storyData.chap,
        updatedAt: new Date()
      };
      
      if (body.status !== undefined) updateData.status = storyData.status;
      if (body.url !== undefined) updateData.url = storyData.url;
      if (body.coverUrl !== undefined) updateData.coverUrl = storyData.coverUrl;
      if (body.rating !== undefined) updateData.rating = storyData.rating;
      if (body.notes !== undefined) updateData.notes = storyData.notes;
      if (body.totalChaps !== undefined) updateData.totalChaps = storyData.totalChaps;
      
      await db.collection('stories').updateOne(
        { _id: existingStory._id },
        { $set: updateData }
      );
      
      return NextResponse.json({ 
        success: true, 
        message: `Đã cập nhật "${existingStory.title}" lên chap ${storyData.chap}.`,
        data: { ...existingStory, ...updateData }
      });
    } else {
      // Thêm truyện mới hoàn toàn
      const result = await db.collection('stories').insertOne({
        ...storyData,
        createdAt: new Date()
      });
      
      return NextResponse.json({ 
        success: true, 
        message: `Đã thêm truyện mới "${storyData.title}" ở chap ${storyData.chap}.`,
        data: { _id: result.insertedId, ...storyData }
      });
    }
  } catch (error) {
    console.error('Error saving story:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
