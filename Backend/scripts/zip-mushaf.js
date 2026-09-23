
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * سكريبت لضغط ملفات تطبيق المصحف بعد البناء للتحديث المباشر
 *
 * Cross-platform:
 * - Windows
 * - macOS
 * - Linux
 */

// ============================================================
// 1. Find Mushaf build directory
// ============================================================

const possibleSourcePaths = [
  path.resolve(process.cwd(), 'Backend/dist/mushaf-wird/browser'),
  path.resolve(process.cwd(), 'Backend/dist/mushaf-wird'),
  path.resolve(process.cwd(), 'dist/mushaf-wird/browser'),
  path.resolve(process.cwd(), 'dist/mushaf-wird')
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

const outputZip = path.join(
  __dirname,
  '..',
  'dist',
  'browser',
  'mushaf-bundle.zip'
);

const outputDir = path.dirname(outputZip);

console.log('📦 Moving to zip Mushaf build files...');

try {

  // ==========================================================
  // 3. Validate source directory
  // ==========================================================

  if (!sourceDir) {
    console.error(
      `❌ Error: Mushaf distribution folder not found.\n\n` +
      `Tested paths:\n- ${possibleSourcePaths.join('\n- ')}\n\n` +
      `Please run "npm run mushaf:build" first.`
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
      '🗑️ Removed old mushaf-bundle.zip'
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
    `✅ Mushaf Bundle created successfully: ${outputZip} (${sizeMB} MB)`
  );

  // ==========================================================
  // 12. Copy ZIP to root dist/browser
  // ==========================================================

  const rootDistZip = path.join(
    __dirname,
    '..',
    '..',
    'dist',
    'browser',
    'mushaf-bundle.zip'
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
              app: 'mushaf'
            });

          if (!config) {

            config =
              new MobileVersion({
                app: 'mushaf'
              });
          }

          let currentVersion =
            config.liveUpdate?.version ||
            '2.2.0';

          let dbParts =
            currentVersion
              .split('.')
              .map(Number);

          if (dbParts.length < 3) {

            dbParts = [
              2,
              2,
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
              'https://knoozbook.com/mushaf-bundle.zip',

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
            `🚀 [AutoVersion] Mushaf Live Update DB version bumped to: ${newVersion}`
          );

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
    '❌ حدث خطأ أثناء ضغط ملفات المصحف:',
    error.message
  );

  process.exit(1);
}