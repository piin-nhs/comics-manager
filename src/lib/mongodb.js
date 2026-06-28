import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MongoDB Atlas URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

// Sử dụng biến global để cache kết nối MongoClient ở cả Dev và Production.
// Điều này cực kỳ quan trọ ng trên Vercel (Serverless) để tái sử dụng connection pool,
// tránh tạo mới kết nối liên tục gây trễ (Handshake/SSL) và cạn kiệt số lượng connection.
if (!global._mongoClientPromise) {
  client = new MongoClient(uri, options);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default clientPromise;

// Tạo indexes một lần duy nhất trong vòng đời của process (không chạy lại ở mỗi request)
async function ensureIndexes(db) {
  const col = db.collection('stories');
  await Promise.all([
    col.createIndex({ title: 1 }),
    col.createIndex({ updatedAt: -1 }),
    col.createIndex({ status: 1 }),
    col.createIndex({ status: 1, updatedAt: -1 }),  // compound: lọ của lấy theo status + sort thời gian
    col.createIndex({ totalChaps: 1 }),
  ]);
}

export async function getDb() {
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'comics_db');

  // Chỉ tạo indexes một lần/process — không block request, chạy nền
  if (!global._mongoIndexesEnsured) {
    global._mongoIndexesEnsured = true;
    ensureIndexes(db).catch(err => console.error('Index creation error:', err));
  }

  return db;
}
