export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Crypto Market Aggregation Service API",
    version: "1.3.0",
    description:
      "Diploma MVP: aggregation and normalization of crypto market data with REST + WebSocket"
  },
  servers: [{ url: "http://localhost:8080" }],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Admin" },
    { name: "Market" },
    { name: "FX" },
    { name: "History" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Service health-check",
        responses: {
          "200": {
            description: "Service is alive"
          }
        }
      }
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register client user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "displayName"],
                properties: {
                  email: { type: "string", example: "demo@local.dev" },
                  password: { type: "string", example: "Pass1234" },
                  displayName: { type: "string", example: "Demo User" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Registered" },
          "400": { description: "Validation failed" },
          "409": { description: "Email already exists" }
        }
      }
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login client user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "demo@local.dev" },
                  password: { type: "string", example: "Pass1234" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Logged in" },
          "400": { description: "Validation failed" },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user profile by Bearer token",
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string" },
            description: "Bearer <token>"
          }
        ],
        responses: {
          "200": { description: "Profile" },
          "401": { description: "Unauthorized" }
        }
      }
    },
    "/api/v1/auth/profile": {
      patch: {
        tags: ["Auth"],
        summary: "Update current user profile (name/avatar)",
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string" },
            description: "Bearer <token>"
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  displayName: { type: "string", example: "New Name" },
                  avatarUrl: {
                    type: "string",
                    nullable: true,
                    description: "data:image/...;base64,..."
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Profile updated" },
          "400": { description: "Validation failed" },
          "401": { description: "Unauthorized" }
        }
      }
    },
    "/api/v1/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "Get registered users (owner only)",
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string", example: "Bearer <JWT>" },
            description: "Owner JWT token received from /api/v1/auth/login or /api/v1/auth/register"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", default: 200, minimum: 1, maximum: 1000 }
          }
        ],
        responses: {
          "200": { description: "Users list" },
          "403": { description: "Forbidden" }
        }
      }
    },
    "/api/v1/admin/users/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Remove (ban) user by id (owner only)",
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string", example: "Bearer <JWT>" },
            description: "Owner JWT token received from /api/v1/auth/login or /api/v1/auth/register"
          },
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
            description: "User id from /api/v1/admin/users"
          }
        ],
        responses: {
          "200": { description: "User removed" },
          "403": { description: "Forbidden" },
          "404": { description: "User not found" }
        }
      }
        },
    "/api/v1/exchanges": {
      get: {
        tags: ["Market"],
        summary: "List connected adapters",
        responses: {
          "200": { description: "OK" }
        }
      }
    },
    "/api/v1/exchanges/status": {
      get: {
        tags: ["Market"],
        summary: "Get source quality status by exchange",
        responses: {
          "200": { description: "OK" }
        }
      }
    },
    "/api/v1/symbols": {
      get: {
        tags: ["Market"],
        summary: "Configured and discovered symbols",
        responses: {
          "200": { description: "OK" }
        }
      }
    },
    "/api/v1/fx/rates": {
      get: {
        tags: ["FX"],
        summary: "Get conversion rates for selected base currency",
        parameters: [
          {
            in: "query",
            name: "base",
            required: false,
            schema: { type: "string", example: "USD" },
            description: "ISO code, e.g. USD, EUR, UAH"
          }
        ],
        responses: {
          "200": { description: "Rates payload" }
        }
      }
    },
    "/api/v1/markets": {
      get: {
        tags: ["Market"],
        summary: "Get normalized market ticks",
        parameters: [
          {
            in: "query",
            name: "symbol",
            required: false,
            schema: { type: "string" },
            description: "Filter by symbol, e.g. BTCUSDT"
          },
          {
            in: "query",
            name: "exchange",
            required: false,
            schema: { type: "string" },
            description: "Filter by exchange, e.g. binance"
          }
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Validation failed" }
        }
      }
    },
    "/api/v1/aggregates": {
      get: {
        tags: ["Market"],
        summary: "Get aggregates for all symbols",
        responses: {
          "200": { description: "OK" }
        }
      }
    },
    "/api/v1/markets/{symbol}/aggregate": {
      get: {
        tags: ["Market"],
        summary: "Get aggregate for one symbol",
        parameters: [
          {
            in: "path",
            name: "symbol",
            required: true,
            schema: { type: "string" },
            description: "Market symbol, e.g. BTCUSDT"
          }
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Validation failed" },
          "404": { description: "Symbol not found" }
        }
      }
    },
    "/api/v1/history/{symbol}": {
      get: {
        tags: ["History"],
        summary: "Get persisted aggregate history by symbol",
        parameters: [
          {
            in: "path",
            name: "symbol",
            required: true,
            schema: { type: "string" },
            description: "Market symbol, e.g. BTCUSDT"
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", default: 120, minimum: 1, maximum: 1000 }
          }
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Validation failed" }
        }
      }
    }
  }
};



