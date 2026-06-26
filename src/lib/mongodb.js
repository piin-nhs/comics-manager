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
  return client.db(process.env.MONGODB_DB || 'comics_db');
}
