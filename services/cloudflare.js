const axios = require("axios");
const config = require("../configs/index");

// Cloudflare API 통신을 위한 재사용 가능한 axios 인스턴스
const cfApi = axios.create({
  baseURL: "https://api.cloudflare.com/client/v4",
  headers: {
    Authorization: `Bearer ${config.cloudflare.apiToken}`,
    "Content-Type": "application/json",
  },
});

/**
 * 특정 서브도메인이 존재하는지 조회
 */
async function findDnsRecord(subdomain) {
  const fullDomain = `${subdomain}.${config.cloudflare.domain}`;
  const url = `/zones/${config.cloudflare.zoneId}/dns_records?name=${fullDomain}`;
  const response = await cfApi.get(url);
  return response.data.result.length > 0 ? response.data.result[0] : null;
}

/**
 * 새로운 DNS A 레코드를 생성
 */
async function createDnsRecord(subdomain, ip) {
  const url = `/zones/${config.cloudflare.zoneId}/dns_records`;
  const response = await cfApi.post(url, {
    type: "A",
    name: `${subdomain}.${config.cloudflare.domain}`,
    content: ip,
    ttl: 120,
    proxied: false,
  });
  return response.data.result;
}

module.exports = { findDnsRecord, createDnsRecord };
