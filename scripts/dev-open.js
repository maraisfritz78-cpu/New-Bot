#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');
const os = require('os');

const PORT = 9002;
const URL = `http://localhost:${PORT}`;
const MAX_RETRIES = 30; // 30 seconds
const RETRY_INTERVAL = 1000; // 1 second

// Function to check if server is ready
function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      resolve(res.statusCode === 200);
      req.abort();
    }).on('error', () => {
      resolve(false);
    });
    setTimeout(() => {
      req.abort();
      resolve(false);
    }, 1000);
  });
}

// Function to open browser
function openBrowser() {
  const platform = os.platform();
  let cmd;

  if (platform === 'win32') {
    cmd = `start ${URL}`;
  } else if (platform === 'darwin') {
    cmd = `open ${URL}`;
  } else {
    // Linux
    cmd = `xdg-open ${URL}`;
  }

  try {
    if (platform === 'win32') {
      spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore' });
    } else {
      spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' });
    }
    console.log(`✓ Opened ${URL}`);
  } catch (err) {
    console.warn(`Could not open browser: ${err.message}`);
  }
}

// Wait for server to be ready then open browser
(async () => {
  let retries = 0;
  
  console.log(`Waiting for server on ${URL}...`);
  
  while (retries < MAX_RETRIES) {
    if (await isServerReady()) {
      openBrowser();
      process.exit(0);
    }
    retries++;
    await new Promise(r => setTimeout(r, RETRY_INTERVAL));
  }
  
  console.error(`✗ Server did not start within ${MAX_RETRIES}s`);
  process.exit(1);
})();
