# Firebase MCP + Gemini 2.5

## Firebase MCP

Firebase MCP cho Gemini CLI/Gemini Code Assist duoc cau hinh tai `.gemini/settings.json`.

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

MCP server dung credentials cua Firebase CLI tren may dang chay. Dang nhap Firebase CLI truoc khi dung MCP:

```bash
npx firebase-tools@latest login
```

## Gemini Chat

Backend cung cap endpoint:

```http
POST /api/ai/chat
Content-Type: application/json
```

Body:

```json
{
  "message": "Goi y slogan cho quan cafe",
  "history": [
    { "role": "user", "text": "Xin chao" },
    { "role": "model", "text": "Chao ban" }
  ]
}
```

Bien moi truong can co trong `apps/api/.env`:

```env
PORT=5000
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Frontend thu chat tai `/chat`.
