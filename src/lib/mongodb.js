import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MongoDB Atlas URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

// Sử dụng biến global để cache kết nối MongoClient ở cả Dev và Production.
// Điều này cực kỳ quan trọng trên Vercel (Serverless) để tái sử dụng connection pool,
// tránh tạo mới kết nối liên tục gây trễ (Handshake/SSL) và cạn kiệt số lượng connection.
if (!global._mongoClientPromise) {
  client = new MongoClient(uri, options);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

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
