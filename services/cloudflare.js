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

/**
 * 기존 DNS A 레코드의 IP를 수정
 */
async function updateDnsRecord(recordId, newIp) {
  const url = `/zones/${config.cloudflare.zoneId}/dns_records/${recordId}`;
  const response = await cfApi.put(url, {
    type: "A",
    content: newIp,
  });
  return response.data.result;
}

/**
 * 기존 DNS A 레코드를 삭제
 */
async function deleteDnsRecord(recordId) {
  const url = `/zones/${config.cloudflare.zoneId}/dns_records/${recordId}`;
  const response = await cfApi.delete(url);
  return response.data.result;
}

/**
 * 현재 관리 중인 서브도메인(A 레코드) 개수 조회
 */
async function countManagedSubdomains() {
  const zoneId = config.cloudflare.zoneId;
  const baseDomain = config.cloudflare.domain;
  const suffix = `.${baseDomain}`;
  let page = 1;
  let total = 0;
  let totalPages = 1;

  do {
    const response = await cfApi.get(`/zones/${zoneId}/dns_records`, {
      params: {
        per_page: 100,
        page,
        type: "A",
      },
    });

    const records = response.data?.result || [];
    total += records.filter((record) => {
      const name = record?.name;
      if (typeof name !== "string") {
        return false;
      }
      return name === baseDomain || name.endsWith(suffix);
    }).length;

    const info = response.data?.result_info || {};
    totalPages = info.total_pages || 1;
    page += 1;
  } while (page <= totalPages);

  return total;
}

module.exports = {
  findDnsRecord,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  countManagedSubdomains,
};
