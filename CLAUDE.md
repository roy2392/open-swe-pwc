# Claude Development Notes

## Common Issues and Solutions

### GitHub Branch Loading Issues

**Problem**: "Loading branches..." gets stuck, GitHub API calls fail with 400 error

**Root Causes**:
1. **Port Mismatch**: `NEXT_PUBLIC_API_URL` in `.env` doesn't match actual Next.js port
2. **Missing Credentials**: fetch() calls missing `credentials: "include"` for cookie transmission

**Solution**:
1. Update `.env` file: `NEXT_PUBLIC_API_URL="http://localhost:3002/api"` (match actual port)
2. Ensure all GitHub API fetch calls include `credentials: "include"`

**Prevention**:
- Check `.env` file when Next.js starts on different port
- Always use `credentials: "include"` for same-origin API calls that need authentication
- Monitor GitHub Proxy Debug logs for cookie transmission issues

## Environment Configuration

- Frontend runs on port 3002 (Next.js)
- Backend API runs on port 2024 (LangGraph)
- Docs run on port 3003
- Make sure `NEXT_PUBLIC_API_URL` matches the actual frontend port

## Development Commands

- Start all services: `npm run dev`
- Clean and restart: `npm run clean && npm run dev`
- Validate environment: `npm run validate-env`

## New Tools Added

### 1. Centralized API Client (`apps/web/src/utils/api-client.ts`)
- Consistent `credentials: "include"` for all authenticated requests
- Automatic port mismatch warnings
- Better error handling and logging
- Use `githubApiClient()` for GitHub API calls

### 2. Environment Validation Script (`scripts/validate-env.js`)
- Run `npm run validate-env` to check configuration
- Detects port mismatches between .env and runtime
- Validates required environment variables
- Provides helpful warnings and tips

### 3. Improved Error Handling
- Better error messages for authentication failures
- Debug logging for troubleshooting
- Graceful handling of missing cookies

## Customization & Branding

### Removed LangChain References
- **Package.json**: Updated author from "LangChain" to "PwC Development Team"
- **Agent Names**:
  - "Open SWE - Programmer" → "PwC Code Assistant - Development Agent"
  - "Open SWE - Planner" → "PwC Code Assistant - Strategic Planner"
  - "Open SWE - Manager" → "PwC Code Assistant - Project Manager"
  - "Open SWE - Security Auditor" → "PwC Code Assistant - Security Auditor"

### Customized System Prompts
- **Development Agent**: "You are an intelligent development assistant created by PwC's advanced AI team..."
- **Strategic Planner**: "You are PwC's strategic code planning assistant..."
- **Project Manager**: "You're 'PwC Code Assistant', an intelligent AI software engineering coordinator..."
- **Security Auditor**: "You are PwC's specialized cybersecurity analyst..."

### Updated UI References
- **Page Titles**: "Open SWE" → "PwC Code Assistant"
- **Descriptions**: Updated to reflect PwC branding
- **API Key Settings**: Updated references to PwC Code Assistant