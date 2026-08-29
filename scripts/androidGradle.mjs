/**
 * Runs the Android Gradle wrapper with a JDK that actually works.
 *
 * Two failure modes this exists to prevent:
 *
 * 1. `cd android && gradlew.bat <task>` resolves under cmd.exe but NOT under
 *    Git Bash, where it dies with "gradlew.bat: command not found". Because npm
 *    reports the exit code of the whole `&&` chain and the sync step ahead of it
 *    succeeded, the build LOOKED fine while leaving the previous APK in place -
 *    a stale binary that is trivially mistaken for a fresh one.
 *
 * 2. Capacitor 7 / AGP 8 need JDK 21. The JDK on PATH here is 17, so an
 *    unqualified invocation fails on toolchain resolution. Android Studio ships
 *    a bundled JBR 21; prefer it unless JAVA_HOME already points at 21+.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(repoRoot, 'android');

const task = process.argv[2];
if (!task) {
  console.error('usage: node scripts/androidGradle.mjs <gradle-task>');
  process.exit(1);
}

/** JDK 21+ already selected by the environment, or Android Studio's bundled JBR. */
function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Android/Android Studio Preview/jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].filter(Boolean);

  for (const home of candidates) {
    const java = existsSync(path.join(home, 'bin', 'java.exe'))
      ? path.join(home, 'bin', 'java.exe')
      : path.join(home, 'bin', 'java');
    if (!existsSync(java)) continue;
    const probe = spawnSync(java, ['-version'], { encoding: 'utf8' });
    const major = Number(/version "(\d+)/.exec(probe.stderr || probe.stdout || '')?.[1]);
    if (major >= 21) return { home, major };
  }
  return null;
}

const jdk = resolveJavaHome();
if (!jdk) {
  console.error('No JDK 21+ found. Install Android Studio (bundled JBR) or set JAVA_HOME to a JDK 21+.');
  process.exit(1);
}
console.log(`gradle: using JDK ${jdk.major} at ${jdk.home}`);

// Node refuses to spawn a .bat directly (EINVAL) without a shell, and passing
// shell:true would re-introduce quoting bugs on the "Program Files" path. Going
// through cmd.exe with argv separation avoids both.
const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : path.join(androidDir, 'gradlew');
const args = isWindows ? ['/c', path.join(androidDir, 'gradlew.bat'), task] : [task];

const result = spawnSync(command, args, {
  cwd: androidDir,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: jdk.home },
  shell: false,
});

if (result.error) {
  console.error(`gradle wrapper failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
