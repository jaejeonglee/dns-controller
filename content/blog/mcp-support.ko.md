---
title: AI 에이전트가 서브도메인을 만들 수 있게 되었어요 (MCP 지원)
slug: mcp-support
description: sitey.one이 MCP(Model Context Protocol)를 지원합니다. Claude, Cursor 같은 AI 에이전트가 서브도메인을 자동으로 생성하고 관리할 수 있어요.
date: 2026-04-15
---

안녕하세요, Sitey입니다. 🚀

오늘부터 **AI 에이전트가 sitey.one에서 서브도메인을 직접 만들고 관리할 수 있어요.**

## MCP가 뭔가요?

MCP(Model Context Protocol)는 AI 에이전트가 외부 서비스에 연결하는 표준 프로토콜이에요. Anthropic이 만들었고, Claude, Cursor, Windsurf 같은 AI 도구들이 지원해요.

쉽게 말하면: **AI에게 "서브도메인 만들어줘"라고 말하면, AI가 알아서 sitey.one에 만들어주는 거예요.**

## 왜 만들었나요?

바이브코딩 시대에 개발자들이 프로젝트를 만들면 배포할 도메인이 필요해요. AI 에이전트가 코드를 짜고, 빌드하고, 배포까지 하는데 — 도메인만 사람이 직접 설정해야 했어요.

이제 AI 에이전트가 sitey.one MCP에 연결하면 도메인 설정까지 자동으로 할 수 있어요.

## 어떻게 쓰나요?

### 1. 에이전트 설정에 추가

Claude Desktop, Cursor 등의 MCP 설정에 한 줄 추가하면 돼요:

```json
{
  "mcpServers": {
    "sitey": {
      "url": "https://sitey.one/mcp"
    }
  }
}
```

### 2. 에이전트에게 말하기

설정 후에는 이렇게 말하면 돼요:

- "demo.sitey.one을 1.2.3.4에 연결해줘"
- "내 서브도메인 목록 보여줘"
- "demo.sitey.one IP를 5.6.7.8로 바꿔줘"
- "demo.sitey.one 삭제해줘"
- "demo.sitey.one을 Vercel에 연결해줘" (CNAME + TXT 자동 생성)

에이전트가 MCP를 통해 자동으로 처리해요. 가입도 필요 없어요.

### 3. 제공하는 도구

| 도구 | 설명 |
|---|---|
| `check_availability` | 서브도메인 사용 가능 여부 확인 |
| `create_subdomain` | A 또는 CNAME 레코드 생성 |
| `create_txt_record` | TXT 레코드 생성 (Vercel, Netlify 등 도메인 인증용) |
| `delete_txt_record` | TXT 레코드 삭제 |
| `list_subdomains` | 내가 만든 서브도메인 목록 |
| `update_subdomain` | 레코드 값 변경 |
| `delete_subdomain` | 서브도메인 삭제 |

### 4. Vercel 배포 예시

Vercel에 커스텀 도메인을 연결하려면 CNAME + TXT 두 개가 필요해요. 에이전트에게 이렇게 말하면 돼요:

```
"demo.sitey.one을 Vercel에 연결해줘. CNAME은 cname.vercel-dns.com으로, TXT 인증 토큰은 abc123이야."
```

에이전트가 자동으로:
1. `create_subdomain` → demo CNAME cname.vercel-dns.com
2. `create_txt_record` → _vercel.demo TXT abc123

두 단계를 처리해줘요.

## 제한 사항

- **익명 사용**: 가입 없이 IP당 최대 3개 서브도메인
- **무제한 사용**: sitey.one에서 가입 후 API key를 발급받으면 제한 없이 사용 가능
- 블랙리스트 서브도메인 (admin, www, ns1 등)은 생성 불가
- A, CNAME 레코드만 지원

## 더 많은 서브도메인이 필요하다면

sitey.one 웹사이트에서 Google 로그인 후 API key를 발급받으세요. 에이전트 설정에 헤더를 추가하면 무제한으로 사용할 수 있어요.

## 기술적 세부사항

- 프로토콜: MCP (Streamable HTTP transport)
- 엔드포인트: `https://sitey.one/mcp`
- 디스커버리: `https://sitey.one/.well-known/mcp.json`
- DNS 반영: 즉시 (자체 BIND9 네임서버 운영)

질문이나 피드백은 [텔레그램 커뮤니티](https://t.me/+yvrIFDbssJ0wNDJl)에서 받고 있어요.

감사합니다! 🙌
