#!/usr/bin/env node

/**
 * Environment validation script
 * Run this to check for common configuration issues
 */

const fs = require('fs');
const path = require('path');

function validateEnvironment() {
  console.log('🔍 Validating environment configuration...\n');

  const webEnvPath = path.join(__dirname, '../apps/web/.env');
  let hasIssues = false;

  if (!fs.existsSync(webEnvPath)) {
    console.error('❌ Missing .env file at apps/web/.env');
    return false;
  }

  const envContent = fs.readFileSync(webEnvPath, 'utf8');
  const envVars = {};

  // Parse environment variables
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      envVars[match[1]] = match[2].replace(/^"|"$/g, '');
    }
  });

  // Check NEXT_PUBLIC_API_URL
  const apiUrl = envVars['NEXT_PUBLIC_API_URL'];
  if (!apiUrl) {
    console.error('❌ Missing NEXT_PUBLIC_API_URL in .env');
    hasIssues = true;
  } else {
    try {
      const url = new URL(apiUrl);
      const port = url.port;

      console.log(`✅ API URL: ${apiUrl}`);

      if (port === '3000') {
        console.warn('⚠️  Warning: API URL uses port 3000, but Next.js might start on 3002 if 3000 is busy');
        console.warn('   If you see "Loading branches..." issues, update NEXT_PUBLIC_API_URL to match the actual port');
      }
    } catch (error) {
      console.error('❌ Invalid NEXT_PUBLIC_API_URL format');
      hasIssues = true;
    }
  }

  // Check GitHub App configuration
  const requiredGitHubVars = [
    'NEXT_PUBLIC_GITHUB_APP_CLIENT_ID',
    'GITHUB_APP_CLIENT_SECRET',
    'GITHUB_APP_REDIRECT_URI',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY'
  ];

  requiredGitHubVars.forEach(varName => {
    if (!envVars[varName]) {
      console.error(`❌ Missing ${varName} in .env`);
      hasIssues = true;
    } else if (varName === 'GITHUB_APP_REDIRECT_URI') {
      const redirectUrl = envVars[varName];
      try {
        const url = new URL(redirectUrl);
        console.log(`✅ GitHub redirect URI: ${redirectUrl}`);

        if (url.port === '3000') {
          console.warn('⚠️  Warning: GitHub redirect URI uses port 3000, ensure this matches your running app port');
        }
      } catch (error) {
        console.error('❌ Invalid GITHUB_APP_REDIRECT_URI format');
        hasIssues = true;
      }
    } else {
      console.log(`✅ ${varName}: configured`);
    }
  });

  console.log('\n' + (hasIssues ? '❌ Issues found in configuration' : '✅ Environment validation passed'));

  if (!hasIssues) {
    console.log('\n💡 Tips:');
    console.log('   - If Next.js starts on a different port, update NEXT_PUBLIC_API_URL accordingly');
    console.log('   - Ensure GitHub App redirect URI matches the actual running port');
    console.log('   - Check CLAUDE.md for troubleshooting common issues');
  }

  return !hasIssues;
}

if (require.main === module) {
  const isValid = validateEnvironment();
  process.exit(isValid ? 0 : 1);
}

module.exports = { validateEnvironment };