import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MongoDB Atlas URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
  // Trong môi trường development, sử dụng biến global để cache kết nối
  // tránh tạo mới kết nối liên tục khi Next.js reload (HMR).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // Trong môi trường production, kết nối trực tiếp bình thường.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export kết nối MongoClient
export default clientPromise;

// Helper function để lấy nhanh đối tượng DB
export async function getDb() {
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'comics_db');
  
  // Tạo các index để tối ưu hóa tìm kiếm, sắp xếp và lọc trong MongoDB
  // createIndex là idempotent (chỉ tạo nếu chưa tồn tại)
  try {
    db.collection('stories').createIndex({ title: 1 });
    db.collection('stories').createIndex({ updatedAt: -1 });
    db.collection('stories').createIndex({ status: 1 });
  } catch (err) {
    console.error('Lỗi tạo index MongoDB:', err);
  }
  
  return db;
}
