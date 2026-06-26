import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// API Cập nhật thông tin truyện theo ID (PATCH)
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400 });
    }
    
    const db = await getDb();
    
    // Chuẩn bị dữ liệu cập nhật
    const updateData = {
      updatedAt: new Date()
    };
    
    // Chỉ cập nhật các trường được truyền lên
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.chap !== undefined) updateData.chap = body.chap.toString().trim();
    if (body.status !== undefined) updateData.status = body.status;
    if (body.url !== undefined) updateData.url = body.url.trim();
    if (body.coverUrl !== undefined) updateData.coverUrl = body.coverUrl.trim();
    if (body.rating !== undefined) updateData.rating = Number(body.rating);
    if (body.notes !== undefined) updateData.notes = body.notes.trim();
    if (body.totalChaps !== undefined) updateData.totalChaps = Number(body.totalChaps) || 0;
    if (body.lastScannedAt !== undefined) updateData.lastScannedAt = new Date(body.lastScannedAt);
    
    const result = await db.collection('stories').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy truyện' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Đã cập nhật thông tin truyện.',
      data: updateData
    });
  } catch (error) {
    console.error('Error updating story:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// API Xóa truyện theo ID (DELETE)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400 });
    }
    
    const db = await getDb();
    const result = await db.collection('stories').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy truyện để xóa' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Đã xóa truyện thành công.'
    });
  } catch (error) {
    console.error('Error deleting story:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
