const fs = require('fs');
const { execSync } = require('child_process');

// Keys to sync from .env.local to Vercel
const KEYS_TO_SYNC = [
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_PUSHER_KEY',
  'NEXT_PUBLIC_PUSHER_CLUSTER',
  'PUSHER_APP_ID',
  'PUSHER_SECRET',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'GITHUB_APP_ID',
  'GITHUB_CLIENT_ID',
  'NOTION_DATABASE_ID',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'POSTGRES_DATABASE',
  'POSTGRES_USER',
  'POSTGRES_HOST'
];

try {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const lines = envFile.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    
    // Split by first equals sign
    const firstEqualsIndex = line.indexOf('=');
    if (firstEqualsIndex === -1) continue;
    
    const key = line.substring(0, firstEqualsIndex).trim();
    let value = line.substring(firstEqualsIndex + 1).trim();
    
    if (KEYS_TO_SYNC.includes(key) && value) {
      console.log(`Syncing ${key}...`);
      
      // Remove wrapping quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      
      try {
        // Run vercel env add. It reads from stdin.
        execSync(`vercel env add ${key} production`, {
          input: value,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        console.log(`✅ Successfully added ${key}`);
      } catch (err) {
        console.error(`❌ Failed to add ${key}: error, maybe already exists?`);
      }
    }
  }
} catch (error) {
  console.error('Error reading .env.local:', error);
}
