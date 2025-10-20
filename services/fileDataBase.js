// services/fileDb.js
const fs = require("fs").promises;
const path = require("path");

const dbPath = path.join(__dirname, "../db.json");

// 헬퍼 함수: DB 파일 읽기
async function readDb() {
  try {
    const data = await fs.readFile(dbPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      // 파일이 없으면 빈 배열 반환
      return [];
    }
    throw error;
  }
}

// 헬퍼 함수: DB 파일 쓰기
async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf8");
}

// 레코드 찾기
async function findRecord(subdomain) {
  const db = await readDb();
  return db.find((record) => record.subdomain === subdomain);
}

// 레코드 추가
async function addRecord(record) {
  const db = await readDb();
  db.push(record);
  await writeDb(db);
}

// 레코드 삭제
async function deleteRecord(subdomain) {
  let db = await readDb();
  db = db.filter((record) => record.subdomain !== subdomain);
  await writeDb(db);
}

// 레코드 IP 업데이트
async function updateRecordIp(subdomain, newIp) {
  let db = await readDb();
  const recordIndex = db.findIndex((record) => record.subdomain === subdomain);
  if (recordIndex > -1) {
    db[recordIndex].ip = newIp;
    await writeDb(db);
  }
}

module.exports = {
  findRecord,
  addRecord,
  deleteRecord,
  updateRecordIp,
};
