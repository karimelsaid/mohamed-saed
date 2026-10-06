
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * سكريبت لضغط ملفات تطبيق وَتِين بعد البناء للتحديث المباشر
 *
 * Cross-platform:
 * - Windows
 * - macOS
 * - Linux
 */

// ============================================================
// 1. Find Watin build directory
// ============================================================

const possibleSourcePaths = [
  path.resolve(process.cwd(), 'dist/watin/browser'),
  path.resolve(process.cwd(), 'dist/watin'),
  path.resolve(process.cwd(), 'Backend/dist/watin/browser'),
  path.resolve(process.cwd(), 'Backend/dist/watin'),
  path.resolve(process.cwd(), 'dist/watin-mobile/browser'),
  path.resolve(process.cwd(), 'dist/watin-mobile')
];

let sourceDir = null;

for (const p of possibleSourcePaths) {
  if (fs.existsSync(p)) {
    sourceDir = p;
    break;
  }
}

// ============================================================
// 2. Output paths
// ============================================================

let outputZip = path.join(
  __dirname,
  '..',
  '..',
  'dist',
  'browser',
  'watin-bundle.zip'
);

let outputDir = path.dirname(outputZip);

// If outputDir doesn't exist, use Backend/dist/browser as fallback
if (!fs.existsSync(outputDir)) {
  outputDir = path.join(__dirname, '..', 'dist', 'browser');
  outputZip = path.join(outputDir, 'watin-bundle.zip'); // Fix: Update outputZip too!
}

console.log('📦 Moving to zip Watin build files...');

try {

  // ==========================================================
  // 3. Validate source directory
  // ==========================================================

  if (!sourceDir) {
    console.error(
      `❌ Error: Watin distribution folder not found.\n\n` +
      `Tested paths:\n- ${possibleSourcePaths.join('\n- ')}\n\n` +
      `Please run "npm run watin:build" first.`
    );

    process.exit(1);
  }

  console.log(`📂 Found source at: ${sourceDir}`);
  console.log(`🎯 Output target: ${outputZip}`);

  // ==========================================================
  // 4. Ensure output directory exists
  // ==========================================================

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
      recursive: true
    });
  }

  // ==========================================================
  // 5. Ensure index.html exists
  // ==========================================================

  const indexHtml = path.join(
    sourceDir,
    'index.html'
  );

  const indexCsrHtml = path.join(
    sourceDir,
    'index.csr.html'
  );

  if (!fs.existsSync(indexHtml) && fs.existsSync(indexCsrHtml)) {

    console.log(
      '📄 [Fix] Copying index.csr.html to index.html for Capacitor compatibility...'
    );

    fs.copyFileSync(
      indexCsrHtml,
      indexHtml
    );
  }

  // ==========================================================
  // 6. Remove old ZIP
  // ==========================================================

  if (fs.existsSync(outputZip)) {

    fs.unlinkSync(outputZip);

    console.log(
      '🗑️ Removed old watin-bundle.zip'
    );
  }

  // ==========================================================
  // 7. Detect ZIP executable
  // ==========================================================

  let zipCommand = null;

  if (process.platform === 'win32') {

    // --------------------------------------------------------
    // Windows known installation locations
    // --------------------------------------------------------

    const windowsZipPaths = [
      'C:\\Program Files (x86)\\GnuWin32\\bin\\zip.exe',
      'C:\\Program Files\\GnuWin32\\bin\\zip.exe'
    ];

    for (const possibleZip of windowsZipPaths) {

      if (fs.existsSync(possibleZip)) {

        zipCommand = possibleZip;

        break;
      }
    }

    // --------------------------------------------------------
    // Try PATH manually if not found
    // --------------------------------------------------------

    if (!zipCommand) {

      const pathEntries =
        (process.env.PATH || '')
          .split(path.delimiter)
          .filter(Boolean);

      for (const dir of pathEntries) {

        const possibleZip =
          path.join(dir, 'zip.exe');

        if (fs.existsSync(possibleZip)) {

          zipCommand = possibleZip;

          break;
        }
      }
    }

  } else {

    // macOS / Linux
    zipCommand = 'zip';
  }

  // ==========================================================
  // 8. Validate ZIP executable
  // ==========================================================

  if (!zipCommand) {

    throw new Error(
      `Could not find zip executable.\n\n` +
      `Windows expected one of:\n` +
      `- C:\\Program Files (x86)\\GnuWin32\\bin\\zip.exe\n` +
      `- C:\\Program Files\\GnuWin32\\bin\\zip.exe\n\n` +
      `Make sure GnuWin32 Zip is installed.`
    );
  }

  console.log(
    `🔍 Found ZIP executable: ${zipCommand}`
  );

  // ==========================================================
  // 9. ZIP arguments
  // ==========================================================

  const zipArgs = [
    '-r',
    '-q',
    '-X',

    outputZip,

    '.',

    '--exclude',
    '*.map',

    '--exclude',
    '*.DS_Store',

    '--exclude',
    '__MACOSX/*'
  ];

  // ==========================================================
  // 10. Run ZIP
  // ==========================================================

  console.log('🔧 Running ZIP...');

  execFileSync(
    zipCommand,
    zipArgs,
    {
      cwd: sourceDir,
      stdio: 'inherit'
    }
  );

  // ==========================================================
  // 11. Verify ZIP
  // ==========================================================

  if (!fs.existsSync(outputZip)) {

    throw new Error(
      'ZIP command completed but the output file was not created.'
    );
  }

  const stats = fs.statSync(
    outputZip
  );

  const sizeMB = (
    stats.size /
    (1024 * 1024)
  ).toFixed(2);

  console.log(
    `✅ Watin Bundle created successfully: ${outputZip} (${sizeMB} MB)`
  );

  // ==========================================================
  // 12. Copy ZIP to root dist/browser
  // ==========================================================

  const rootDistZip = path.join(
    process.cwd(),
    'dist',
    'browser',
    'watin-bundle.zip'
  );

  if (
    path.resolve(outputZip) !==
    path.resolve(rootDistZip)
  ) {

    try {

      const rootDistDir =
        path.dirname(rootDistZip);

      if (!fs.existsSync(rootDistDir)) {

        fs.mkdirSync(
          rootDistDir,
          {
            recursive: true
          }
        );
      }

      fs.copyFileSync(
        outputZip,
        rootDistZip
      );

      console.log(
        `📋 Copied bundle to root Nginx dir: ${rootDistZip}`
      );

    } catch (copyError) {

      console.warn(
        '⚠️ Could not copy bundle to root Nginx directory:',
        copyError.message
      );
    }
  }

  // ==========================================================
  // 13. Auto-bump MongoDB version
  // ==========================================================

  try {

    const mongoose = require('mongoose');

    require('dotenv').config({
      path: path.join(
        __dirname,
        '..',
        '.env'
      )
    });

    // Also try Backend/.env if not found
    if (!process.env.MONGO_URI) {
      require('dotenv').config({
        path: path.join(
          __dirname,
          '.env'
        )
      });
    }

    const MobileVersion =
      require('../models/MobileVersion.model');

    const mongoUri =
      process.env.MONGO_URI;

    if (!mongoUri) {

      console.warn(
        '⚠️ [AutoVersion] MONGO_URI is not configured in .env'
      );

    } else {

      mongoose
        .connect(mongoUri)
        .then(async () => {

          let config =
            await MobileVersion.findOne({
              app: 'watin'
            });

          if (!config) {

            config =
              new MobileVersion({
                app: 'watin'
              });
          }

          let currentVersion =
            config.liveUpdate?.version ||
            '1.0.0';

          let dbParts =
            currentVersion
              .split('.')
              .map(Number);

          if (dbParts.length < 3) {

            dbParts = [
              1,
              0,
              0
            ];
          }

          const newVersion =
            `${dbParts[0]}.` +
            `${dbParts[1]}.` +
            `${(dbParts[2] || 0) + 1}`;

          config.liveUpdate = {
            ...config.liveUpdate,

            version: newVersion,

            enabled: true,

            zipUrl:
              `https://knoozbook.com/watin-bundle-v${newVersion}.zip`,

            lastZipMtime:
              stats.mtime
          };

          if (config.android) {

            config.android.version =
              newVersion;
          }

          if (config.ios) {

            config.ios.version =
              newVersion;
          }

          await config.save();

          console.log(
            `🚀 [AutoVersion] Watin Live Update DB version bumped to: ${newVersion}`
          );

          // Create versioned copy for Cloudflare cache bypass
          try {
            const versionedZip = path.join(
              path.dirname(rootDistZip),
              `watin-bundle-v${newVersion}.zip`
            );

            fs.copyFileSync(
              rootDistZip,
              versionedZip
            );

            console.log(
              `📋 Created versioned copy: ${versionedZip}`
            );

          } catch (versionError) {

            console.warn(
              '⚠️ Could not create versioned copy:',
              versionError.message
            );
          }

          await mongoose.disconnect();

        })
        .catch(err => {

          console.warn(
            '⚠️ [AutoVersion] Could not update MongoDB version:',
            err.message
          );

        });
    }

  } catch (dbErr) {

    console.warn(
      '⚠️ [AutoVersion] MongoDB update skipped:',
      dbErr.message
    );
  }

} catch (error) {

  console.error(
    '❌ حدث خطأ أثناء ضغط ملفات وَتِين:',
    error.message
  );

  process.exit(1);
}
