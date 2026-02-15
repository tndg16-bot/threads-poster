# Threads Graph API Research Notes

## Current Knowledge (as of Feb 2026)

### API Status
- Threads Graph API was officially launched by Meta (Facebook) in late 2023 / early 2024
- It's part of the Facebook Graph API platform
- Provides programmatic access to create and manage Threads posts

### Authentication
- **Method**: OAuth 2.0
- **Required Permissions**: `threads_basic`, `threads_content_publish`
- **App Type**: Facebook Developer App
- **Token Type**: Long-lived access token

### API Endpoints

#### Create Thread (Text Post)
```
POST https://graph.threads.net/v1.0/me/threads
```

**Headers**:
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Body**:
```json
{
  "media_type": "TEXT",
  "text": "Your thread text here",
  "reply_to_id": "{optional_thread_id}"
}
```

**Response**:
```json
{
  "id": "thread_id"
}
```

#### Publish Thread
```
POST https://graph.threads.net/v1.0/me/threads_publish
```

**Body**:
```json
{
  "id": "thread_id"
}
```

### Rate Limits
- Limited to 250 API calls per user per day
- Additional limits may apply during beta periods

## Required Setup

### 1. Facebook Developer Account
- Create account at https://developers.facebook.com
- Verify account with phone number

### 2. Create Facebook App
- Go to https://developers.facebook.com/apps
- Create new app type "Consumer" or "Business"
- Add "Threads API" product

### 3. Configure App Settings
- Set App Domains
- Add OAuth Redirect URIs
- Enable required permissions:
  - `threads_basic`
  - `threads_content_publish`

### 4. Get Access Token
- Use OAuth flow or Facebook Access Token Tool
- Generate Long-lived token (expires in 60 days)
- Store securely

## Implementation Requirements

### Environment Variables
```
THREADS_APP_ID=your_app_id
THREADS_APP_SECRET=your_app_secret
THREADS_ACCESS_TOKEN=your_access_token
THREADS_REDIRECT_URI=your_redirect_uri
```

### Node.js Dependencies
- `node-fetch` or `axios` for HTTP requests
- `dotenv` for environment configuration

## Limitations & Considerations

1. **Text Only (Initial Implementation)**: This first implementation focuses on text posts only
2. **Media Support**: Image/video uploads require additional API endpoints
3. **Replies**: Can reply to existing threads via `reply_to_id`
4. **Threads**: Creating thread series requires multiple API calls
5. **Token Refresh**: Long-lived tokens need to be refreshed periodically

## Future Enhancements

- Image upload support
- Thread series (multi-part posts)
- Reply functionality
- Delete posts
- User information retrieval
- Analytics insights

## Documentation References
- Official Docs: https://developers.facebook.com/docs/threads
- Graph API Reference: https://developers.facebook.com/docs/graph-api/reference
