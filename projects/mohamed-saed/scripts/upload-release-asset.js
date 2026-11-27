const fs = require('fs');
const path = require('path');
const https = require('https');

function getGitToken() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.argv[2]) {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.argv[2];
  }
  try {
    const cp = require('child_process');
    const out = cp.execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const match = out.match(/^password=(.+)$/m);
    if (match && match[1]) return match[1].trim();
  } catch (_) {}
  return '';
}

const TOKEN = getGitToken();
const REPO = 'karimelsaid/mohamed-saed';
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const TAG = `v${pkg.version}`;
const EXE_PATH = path.resolve(__dirname, '..', 'dist', `نظام إدارة محلات بيع وتأجير بدل Setup ${pkg.version}.exe`);

if (!fs.existsSync(EXE_PATH)) {
  console.error('Installer EXE not found at:', EXE_PATH);
  process.exit(1);
}

function githubRequest(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'SuitStoreUploader',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(options.headers || {})
      }
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsedBody });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function main() {
  console.log(`1. Creating or getting release for tag ${TAG} on ${REPO}...`);

  // Check if release exists
  let release = null;
  const getRes = await githubRequest(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`);
  if (getRes.status === 200 && getRes.data?.id) {
    release = getRes.data;
    console.log(`  ✓ Release exists (ID: ${release.id})`);
  } else {
    // Create release
    let releaseNotes = `تحديث رسمي جديد للإصدار ${TAG}`;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'dist', 'latest-release.json'), 'utf8'));
      if (manifest.releaseNotes) releaseNotes = manifest.releaseNotes;
    } catch (_) {}
    const createRes = await githubRequest(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      tag_name: TAG,
      name: `Release ${TAG} - نظام إدارة محلات البدل`,
      body: releaseNotes,
      draft: false,
      prerelease: false
    });

    if (createRes.status === 201 && createRes.data?.id) {
      release = createRes.data;
      console.log(`  ✓ Created release successfully (ID: ${release.id})`);
    } else {
      console.error('Failed to create release:', createRes.status, createRes.data);
      process.exit(1);
    }
  }

  // Upload Asset
  console.log('\n2. Uploading installer asset to release...');
  const stats = fs.statSync(EXE_PATH);
  const fileSizeMb = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`  File size: ${fileSizeMb} MB`);

  const assetName = `suit-store-update-${pkg.version}.exe`;
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`);

  console.log(`  Uploading ${assetName} to ${uploadUrl}...`);
  const fileBuffer = fs.readFileSync(EXE_PATH);

  const uploadRes = await githubRequest(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuffer.length
    }
  }, fileBuffer);

  if (uploadRes.status === 201) {
    console.log(`\n========================================================`);
    console.log(`✅ Asset uploaded successfully to GitHub Release!`);
    console.log(`Download URL: https://github.com/${REPO}/releases/download/${TAG}/${assetName}`);
    console.log(`========================================================\n`);
  } else {
    console.error('Asset upload response:', uploadRes.status, uploadRes.data);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
