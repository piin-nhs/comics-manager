import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// API Lấy danh sách truyện (có tìm kiếm, lọc trạng thái, sắp xếp)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'updatedAt_desc';
    const progress = searchParams.get('progress') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = await getDb();

    // Xây dựng điều kiện lọc ($match)
    const matchQuery = {};
    if (search) {
      matchQuery.title = { $regex: search, $options: 'i' };
    }
    if (status) {
      matchQuery.status = status;
    }
    if (progress === 'complete') {
      matchQuery.$expr = {
        $and: [
          { $gt: [{ $toDouble: { $ifNull: ['$totalChaps', 0] } }, 0] },
          { $gte: [
            { $convert: { input: '$chap', to: 'double', onError: 0, onNull: 0 } },
            { $toDouble: { $ifNull: ['$totalChaps', 0] } }
          ]}
        ]
      };
    } else if (progress === 'incomplete') {
      matchQuery.$expr = {
        $or: [
          { $lte: [{ $toDouble: { $ifNull: ['$totalChaps', 0] } }, 0] },
          { $lt: [
            { $convert: { input: '$chap', to: 'double', onError: 0, onNull: 0 } },
            { $toDouble: { $ifNull: ['$totalChaps', 0] } }
          ]}
        ]
      };
    }

    const startIndex = (page - 1) * limit;

    // Xây dựng pipeline aggregation — tất cả trong 1 round trip MongoDB
    const pipeline = [{ $match: matchQuery }];

    // Thêm bước tính toán và sắp xếp theo loại sort
    if (sort === 'chap_asc' || sort === 'chap_desc') {
      pipeline.push({ $addFields: {
        _chapNum: { $convert: { input: '$chap', to: 'double', onError: 0, onNull: 0 } }
      }});
      pipeline.push({ $sort: { _chapNum: sort === 'chap_asc' ? 1 : -1, updatedAt: -1 } });

    } else if (sort === 'unread_asc' || sort === 'unread_desc') {
      const noTotalFallback = sort === 'unread_asc' ? 999999 : -1;
      pipeline.push({ $addFields: {
        _chapNum:      { $convert: { input: '$chap', to: 'double', onError: 0, onNull: 0 } },
        _totalChapNum: { $toDouble: { $ifNull: ['$totalChaps', 0] } }
      }});
      pipeline.push({ $addFields: {
        _unreadCount: {
          $cond: {
            if:   { $gt: ['$_totalChapNum', 0] },
            then: { $max: [{ $subtract: ['$_totalChapNum', '$_chapNum'] }, 0] },
            else: noTotalFallback
          }
        }
      }});
      pipeline.push({ $sort: { _unreadCount: sort === 'unread_asc' ? 1 : -1, updatedAt: -1 } });

    } else {
      // Sort thông thường — dùng index MongoDB trực tiếp
      const sortMap = {
        title_asc:      { title: 1 },
        title_desc:     { title: -1 },
        updatedAt_asc:  { updatedAt: 1 },
        updatedAt_desc: { updatedAt: -1 },
      };
      pipeline.push({ $sort: sortMap[sort] || { updatedAt: -1 } });
    }

    // $facet: gộp đếm tổng + lấy dữ liệu trang thành 1 query duy nhất (tiết kiệm 1 round trip)
    pipeline.push({ $facet: {
      data: [
        { $skip: startIndex },
        { $limit: limit },
        // Loại bỏ các field tạm tính — không cần trả về client
        { $project: { _chapNum: 0, _totalChapNum: 0, _unreadCount: 0 } }
      ],
      meta: [{ $count: 'total' }]
    }});

    const [result] = await db.collection('stories').aggregate(pipeline).toArray();
    const paginatedStories = result?.data || [];
    const totalCount = result?.meta?.[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      success: true,
      data: paginatedStories,
      pagination: {
        total: totalCount,
        totalPages,
        currentPage: page,
        limit
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
